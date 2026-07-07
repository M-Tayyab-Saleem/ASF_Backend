const mongoose = require('mongoose');

const ownerSchema = new mongoose.Schema({
  fullName:     { type: String, required: true, trim: true },
  email:        { type: String, required: true, unique: true, lowercase: true },
  businessUnit: { type: String },
  role:         { type: String, default: 'Tool Owner' },
  phone:        { type: String, default: null },
  // Tools this owner is responsible for
  tools:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tool' }],
  createdAt:    { type: Date, default: Date.now },
  updatedAt:    { type: Date, default: Date.now }
});

// ownerSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('Owner', ownerSchema);
