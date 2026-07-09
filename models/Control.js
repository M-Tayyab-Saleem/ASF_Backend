const mongoose = require('mongoose');

// ── Lifecycle history sub-document ────────────────────────────────────────────
const lifecycleEntrySchema = new mongoose.Schema({
  stage:     { type: String, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  changedAt: { type: Date, default: Date.now },
  reason:    { type: String, default: null }
}, { _id: false });

// ── Main Control schema ───────────────────────────────────────────────────────
const controlSchema = new mongoose.Schema({
  // ── Legacy fields (preserved for backward compat) ──
  controlId:          { type: String, required: true },
  controlName:        { type: String },
  controlDescription: { type: String },
  controlDomain:      { type: String },
  controlObjective:   { type: String },
  owner:              { type: String },           // legacy string owner
  priority:           { type: String },
  status:             { type: String, enum: ['Pending', 'Implemented', 'Not Implemented', null], default: 'Pending' },
  statusUpdatedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  statusUpdatedAt:    { type: Date, default: null },
  implementationState: { type: String },
  capabilityId:       { type: String, required: true, index: true },
  strategyId:         { type: String, required: true, index: true },

  // ── Phase 3 fields ─────────────────────────────────
  title:       { type: String },   // preferred alias for controlName
  description: { type: String },   // preferred alias for controlDescription
  category:    { type: String },   // preferred alias for controlDomain
  notes:       { type: String },   // User notes for the control

  riskLevel:   { type: String, enum: ['Low', 'Medium', 'High', null], default: null },

  // ObjectId-based owner reference (from Owners directory)
  ownerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', default: null },

  // Linked tools (ObjectId refs to Tool collection)
  linkedTools: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tool' }],

  // 5-stage lifecycle (replaces old 3-status pattern)
  lifecycleStage: {
    type: String,
    enum: ['Defined', 'Implemented', 'Evidence Added', 'Validated', 'Review'],
    default: 'Defined'
  },

  // At Risk flag — independent of lifecycle stage
  atRisk: { type: Boolean, default: false },

  // Full history of every stage transition
  lifecycleHistory: { type: [lifecycleEntrySchema], default: [] },

  // Audit
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now }
});

// ── Indexes ───────────────────────────────────────────────────────────────────
controlSchema.index({ controlId: 1 }, { unique: true });
controlSchema.index({ lifecycleStage: 1 });
controlSchema.index({ atRisk: 1 });

module.exports = mongoose.model('Control', controlSchema);
