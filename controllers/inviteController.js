const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Invite = require('../models/Invite');
const User = require('../models/User');
const { sendInviteEmail } = require('../utils/email');

const generateToken = (userId) =>
  jwt.sign({ userId }, 'asf_jwt_secret_key_2024_phase2', { expiresIn: '24h' });

const generateRefreshToken = (userId) =>
  jwt.sign({ userId }, 'asf_refresh_secret_key_2024_phase2', { expiresIn: '7d' });

const INVITE_TTL_HOURS = 72;

// ─── Validation helpers ──────────────────────────────────────────────────────

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  if (!password || password.length < 8)
    return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password))
    return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(password))
    return 'Password must contain at least one number';
  return null;
}

// ─── POST /api/invites  (Admin only) ─────────────────────────────────────────

exports.createInvite = async (req, res) => {
  try {
    const { fullName, email, role } = req.body;

    if (!fullName || !email || !role) {
      return res.status(400).json({ success: false, error: 'fullName, email and role are required', code: 'VALIDATION_ERROR' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format', code: 'VALIDATION_ERROR' });
    }
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Role must be user or admin', code: 'VALIDATION_ERROR' });
    }

    // Uniqueness: no active user with this email
    const existingUser = await User.findOne({ email: email.toLowerCase(), status: 'active' });
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'An active account already exists for this email', code: 'EMAIL_EXISTS' });
    }

    // Uniqueness: no pending invite for this email
    const existingInvite = await Invite.findOne({ email: email.toLowerCase(), status: 'pending' });
    if (existingInvite) {
      return res.status(409).json({ success: false, error: 'A pending invite already exists for this email. Resend or revoke it first.', code: 'INVITE_EXISTS' });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

    const invite = await Invite.create({
      fullName: fullName.trim(),
      email: email.toLowerCase(),
      role,
      token,
      invitedBy: req.user._id,
      expiresAt
    });

    const emailSent = await sendInviteEmail(email, fullName, token);
    if (!emailSent) {
      // Still return success — invite was created; email failure is non-fatal but logged
      return res.status(201).json({
        success: true,
        data: invite,
        warning: 'Invite created but email delivery failed. Copy the token manually if needed.'
      });
    }

    res.status(201).json({ success: true, data: invite });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ─── GET /api/invites  (Admin only) ──────────────────────────────────────────

exports.listInvites = async (req, res) => {
  try {
    const invites = await Invite.find()
      .populate('invitedBy', 'fullName email')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: invites, meta: { count: invites.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ─── POST /api/invites/:token/resend  (Admin only) ───────────────────────────

exports.resendInvite = async (req, res) => {
  try {
    const invite = await Invite.findOne({ token: req.params.token });
    if (!invite) {
      return res.status(404).json({ success: false, error: 'Invite not found', code: 'NOT_FOUND' });
    }
    if (['accepted', 'revoked'].includes(invite.status)) {
      return res.status(400).json({ success: false, error: `Cannot resend an ${invite.status} invite`, code: 'INVALID_STATUS' });
    }

    // Generate fresh token + expiry
    invite.token    = crypto.randomUUID();
    invite.expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
    invite.status   = 'pending';
    await invite.save();

    await sendInviteEmail(invite.email, invite.fullName, invite.token);

    res.json({ success: true, data: invite });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ─── DELETE /api/invites/:id  (Admin only) ────────────────────────────────────

exports.revokeInvite = async (req, res) => {
  try {
    const invite = await Invite.findById(req.params.id);
    if (!invite) {
      return res.status(404).json({ success: false, error: 'Invite not found', code: 'NOT_FOUND' });
    }
    if (invite.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Only pending invites can be revoked (current status: ${invite.status})`, code: 'INVALID_STATUS' });
    }
    invite.status = 'revoked';
    await invite.save();
    res.json({ success: true, data: { message: 'Invite revoked' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ─── GET /api/invites/:token  (Public) ───────────────────────────────────────

exports.validateToken = async (req, res) => {
  try {
    const invite = await Invite.findOne({ token: req.params.token });

    if (!invite) {
      return res.status(404).json({ success: false, error: 'Invite not found.', code: 'NOT_FOUND' });
    }
    if (invite.status === 'accepted') {
      return res.status(400).json({ success: false, error: 'This invite has already been accepted. Please log in.', code: 'ALREADY_ACCEPTED' });
    }
    if (invite.status === 'revoked') {
      return res.status(400).json({ success: false, error: 'This invite has been revoked. Contact your administrator.', code: 'REVOKED' });
    }
    if (invite.status === 'expired' || invite.expiresAt < new Date()) {
      // Mark as expired if not already
      if (invite.status !== 'expired') {
        invite.status = 'expired';
        await invite.save();
      }
      return res.status(400).json({ success: false, error: 'This invite has expired. Contact your administrator for a new one.', code: 'EXPIRED' });
    }

    res.json({
      success: true,
      data: {
        fullName: invite.fullName,
        email: invite.email,
        role: invite.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ─── POST /api/invites/:token/accept  (Public) ───────────────────────────────

exports.acceptInvite = async (req, res) => {
  try {
    const { password } = req.body;

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ success: false, error: passwordError, code: 'VALIDATION_ERROR' });
    }

    const invite = await Invite.findOne({ token: req.params.token });

    if (!invite) {
      return res.status(404).json({ success: false, error: 'Invite not found.', code: 'NOT_FOUND' });
    }
    if (invite.status !== 'pending') {
      return res.status(400).json({ success: false, error: `This invite is ${invite.status}. Contact your administrator.`, code: 'INVALID_STATUS' });
    }
    if (invite.expiresAt < new Date()) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ success: false, error: 'This invite has expired. Contact your administrator for a new one.', code: 'EXPIRED' });
    }

    // Check if a user with this email already exists (shouldn't happen, but safety net)
    const existingUser = await User.findOne({ email: invite.email });
    if (existingUser && existingUser.status === 'active') {
      return res.status(409).json({ success: false, error: 'An account with this email already exists. Please log in.', code: 'EMAIL_EXISTS' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      fullName: invite.fullName,
      email: invite.email,
      passwordHash,
      role: invite.role,
      status: 'active',
      invitedBy: invite.invitedBy
    });

    // Mark invite accepted
    invite.status = 'accepted';
    await invite.save();

    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
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
