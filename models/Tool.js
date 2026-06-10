const mongoose = require('mongoose');

const toolSchema = new mongoose.Schema({
  toolId: { type: String, required: true, unique: true },
  toolName: { type: String },
  toolCategory: { type: String },
  vendor: { type: String },
  toolDescription: { type: String },
  primaryFunction: { type: String },
  aiControlRelevance: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Tool', toolSchema);
