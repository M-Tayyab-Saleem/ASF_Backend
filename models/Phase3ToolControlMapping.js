const mongoose = require('mongoose');

// Phase 3 Tool Control Mapping
// Replaces the old string-based mapping with proper ObjectId refs
const phase3MappingSchema = new mongoose.Schema({
  toolId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tool', required: true },
  controlId: { type: mongoose.Schema.Types.ObjectId, ref: 'Control', required: true },
  
  // Rationale for mapping (optional)
  description: { type: String, default: '' },
  
  // Has this mapping been verified by an admin?
  verified: { type: Boolean, default: false },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now }
});

// A tool cannot be mapped to the same control twice
phase3MappingSchema.index({ toolId: 1, controlId: 1 }, { unique: true });
phase3MappingSchema.index({ controlId: 1 }); // for reverse lookups

module.exports = mongoose.model('Phase3ToolControlMapping', phase3MappingSchema);
