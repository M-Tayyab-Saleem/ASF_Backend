const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { sendOTPEmail } = require('../utils/email');

const generateToken = (userId) => {
  return jwt.sign({ userId }, 'asf_jwt_secret_key_2024_phase2', { expiresIn: '24h' });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, 'asf_refresh_secret_key_2024_phase2', { expiresIn: '7d' });
};

exports.signup = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ success: false, error: 'All fields are required', code: 'VALIDATION_ERROR' });
    }

    if (fullName.length < 2 || fullName.length > 80) {
      return res.status(400).json({ success: false, error: 'Full name must be 2-80 characters', code: 'VALIDATION_ERROR' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format', code: 'VALIDATION_ERROR' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters', code: 'VALIDATION_ERROR' });
    }

    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ success: false, error: 'Password must contain at least one uppercase letter', code: 'VALIDATION_ERROR' });
    }

    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ success: false, error: 'Password must contain at least one number', code: 'VALIDATION_ERROR' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Email already registered', code: 'EMAIL_EXISTS' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    
    // Generate a 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const user = await User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase(),
      passwordHash,
      role: 'user',
      isVerified: false,
      otp,
      otpExpires
    });

    // Send the OTP via email
    const emailSent = await sendOTPEmail(user.email, otp);

    if (!emailSent) {
      return res.status(500).json({ success: false, error: 'Failed to send verification email. Please try again later.', code: 'EMAIL_SEND_FAILED' });
    }

    res.status(201).json({
      success: true,
      data: {
        message: 'Verification code sent to email',
        email: user.email,
        requireOtp: true
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required', code: 'VALIDATION_ERROR' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ success: false, error: 'Please verify your email before logging in', code: 'UNVERIFIED_EMAIL', data: { email: user.email } });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.logout = async (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ success: true, data: { message: 'Logged out successfully' } });
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-passwordHash');
    res.json({
      success: true,
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ success: false, error: 'Refresh token required', code: 'AUTH_REQUIRED' });
    }

    const decoded = jwt.verify(token, 'asf_refresh_secret_key_2024_phase2');
    const user = await User.findById(decoded.userId).select('-passwordHash');

    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    const newToken = generateToken(user._id);
    res.json({
      success: true,
      data: { token }
    });
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid refresh token', code: 'INVALID_TOKEN' });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Email and OTP are required', code: 'VALIDATION_ERROR' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+otp +otpExpires');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, error: 'Email is already verified', code: 'ALREADY_VERIFIED' });
    }

    if (!user.otp || !user.otpExpires || Date.now() > user.otpExpires) {
      return res.status(400).json({ success: false, error: 'OTP has expired', code: 'OTP_EXPIRED' });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ success: false, error: 'Invalid OTP', code: 'INVALID_OTP' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required', code: 'VALIDATION_ERROR' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, error: 'Email is already verified', code: 'ALREADY_VERIFIED' });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    const emailSent = await sendOTPEmail(user.email, otp);

    if (!emailSent) {
      return res.status(500).json({ success: false, error: 'Failed to send verification email. Please try again later.', code: 'EMAIL_SEND_FAILED' });
    }

    res.json({
      success: true,
      data: { message: 'A new verification code has been sent to your email' }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};
