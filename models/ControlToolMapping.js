const mongoose = require('mongoose');

const controlToolMappingSchema = new mongoose.Schema({
  controlId: { type: String, required: true },
  toolId: { type: String, required: true }
});

controlToolMappingSchema.index({ controlId: 1, toolId: 1 }, { unique: true });

module.exports = mongoose.model('ControlToolMapping', controlToolMappingSchema);
