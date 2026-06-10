const mongoose = require('mongoose');

const controlSchema = new mongoose.Schema({
  controlId: { type: String, required: true },
  controlName: { type: String },
  controlDescription: { type: String },
  controlDomain: { type: String },
  controlObjective: { type: String },
  owner: { type: String },
  priority: { type: String },
  status: { type: String },
  implementationState: { type: String },
  lifecycleStage: { type: String },
  capabilityId: { type: String, required: true, index: true },
  strategyId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Control', controlSchema);
