const mongoose = require('mongoose');

const TOOL_CATEGORIES = [
  'Guardrails & Filtering',
  'Observability & Logging',
  'Access Control & IAM',
  'Data Privacy & Redaction',
  'Threat Detection',
  'Model Governance',
  'Testing & Red Teaming',
  'Compliance & Reporting',
  'Other'
];

const toolSchema = new mongoose.Schema({
  // ── Legacy fields (preserved for backward compat) ────────────────────────
  toolId:             { type: String, required: true, unique: true },
  toolName:           { type: String },
  toolCategory:       { type: String },
  vendor:             { type: String },
  toolDescription:    { type: String },
  primaryFunction:    { type: String },
  aiControlRelevance: { type: String },

  // ── Phase 3 fields ────────────────────────────────────────────────────────
  name:        { type: String },               // alias for toolName
  category:    { type: String, enum: [...TOOL_CATEGORIES, null] },  // structured category
  description: { type: String },               // alias for toolDescription
  status:      { type: String, enum: ['Active', 'Under Evaluation', 'Decommissioned'], default: 'Active' },

  // Effectiveness (0-100), set manually by admin
  effectivenessScore: { type: Number, min: 0, max: 100, default: null },

  // Coverage: % of total controls this tool addresses (computed)
  coverageScore: { type: Number, min: 0, max: 100, default: 0 },

  // Owner reference
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', default: null },

  // Tags for search/filtering
  tags: [{ type: String }],

  // Audit
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// toolSchema.index({ toolId: 1 }, { unique: true });
toolSchema.index({ status: 1 });
toolSchema.index({ category: 1 });

module.exports = mongoose.model('Tool', toolSchema);
module.exports.TOOL_CATEGORIES = TOOL_CATEGORIES;
