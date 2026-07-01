const mongoose = require('mongoose');

const controlSchema = new mongoose.Schema({
  controlId: { type: String, required: true },
  controlName: { type: String },
  controlDescription: { type: String },
  controlDomain: { type: String },
  controlObjective: { type: String },
  owner: { type: String },
  priority: { type: String },
  status: { type: String, enum: ['Pending', 'Implemented', 'Not Implemented', null], default: 'Pending' },
  statusUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  statusUpdatedAt: { type: Date, default: null },
  implementationState: { type: String },
  lifecycleStage: { type: String },
  capabilityId: { type: String, required: true, index: true },
  strategyId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Control', controlSchema);
