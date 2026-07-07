const mongoose = require('mongoose');

const inviteSchema = new mongoose.Schema({
  fullName:   { type: String, required: true, trim: true },
  email:      { type: String, required: true, lowercase: true },
  role:       { type: String, enum: ['user', 'admin'], default: 'user' },
  token:      { type: String, required: true, unique: true },
  status:     { type: String, enum: ['pending', 'accepted', 'expired', 'revoked'], default: 'pending' },
  invitedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt:  { type: Date, required: true },
  createdAt:  { type: Date, default: Date.now }
});

// inviteSchema.index({ token: 1 }, { unique: true });
inviteSchema.index({ email: 1 });

module.exports = mongoose.model('Invite', inviteSchema);
