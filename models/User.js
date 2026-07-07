const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName:   { type: String, required: true, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role:       { type: String, enum: ['user', 'admin'], default: 'user' },
  // Phase 3: replaces isVerified; 'pending' = invited but not yet accepted
  status:     { type: String, enum: ['pending', 'active'], default: 'active' },
  invitedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now }
});

// userSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
