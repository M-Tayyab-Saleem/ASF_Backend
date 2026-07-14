const mongoose = require('mongoose');

const capabilityToolMappingSchema = new mongoose.Schema({
  capabilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Capability', required: true },
  toolId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tool', required: true },
  description: { type: String, default: '' },
  verified: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

capabilityToolMappingSchema.index({ capabilityId: 1, toolId: 1 }, { unique: true });

module.exports = mongoose.model('CapabilityToolMapping', capabilityToolMappingSchema);
