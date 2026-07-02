const jwt = require('jsonwebtoken');
const User = require('../models/User');

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, 'asf_jwt_secret_key_2024_phase2');
    const user = await User.findById(decoded.userId).select('-passwordHash');

    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required', code: 'ADMIN_REQUIRED' });
  }
  next();
};

module.exports = { requireAuth, requireAdmin };
