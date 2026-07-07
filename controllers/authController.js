const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (userId) => {
  return jwt.sign({ userId }, 'asf_jwt_secret_key_2024_phase2', { expiresIn: '24h' });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, 'asf_refresh_secret_key_2024_phase2', { expiresIn: '7d' });
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

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, error: 'Account is not yet activated. Please complete your invite to log in.', code: 'ACCOUNT_INACTIVE' });
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
      data: { token: newToken }
    });
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid refresh token', code: 'INVALID_TOKEN' });
  }
};
