const mongoose = require('mongoose');

const strategySchema = new mongoose.Schema({
  strategyId: { type: String, required: true, unique: true },
  strategyName: { type: String },
  strategyDescription: { type: String },
  strategyOwner: { type: String },
  priority: { type: String },
  notes: { type: String },
  capabilityCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Strategy', strategySchema);
