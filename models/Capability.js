const mongoose = require('mongoose');

const capabilitySchema = new mongoose.Schema({
  capabilityId: { type: String, required: true, unique: true },
  capabilityName: { type: String },
  capabilityDescription: { type: String },
  capabilityCategory: { type: String },
  capabilityStatus: { type: String },
  strategyId: { type: String, required: true, index: true },
  controlCount: { type: Number, default: 0 },
  linkedTools: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tool' }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Capability', capabilitySchema);
