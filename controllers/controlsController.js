const Control = require('../models/Control');
const ControlToolMapping = require('../models/ControlToolMapping');
const Tool = require('../models/Tool');

// ── Lifecycle stage order ─────────────────────────────────────────────────────
const STAGES = ['Defined', 'Implemented', 'Evidence Added', 'Validated', 'Review'];

// ── Control ID auto-suggestion ────────────────────────────────────────────────
async function suggestControlId(category) {
  // Derive prefix from first letter of each word, e.g. "Prompt Security" → "PS"
  const prefix = (category || 'GN')
    .split(/\s+/)
    .map(w => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 3);

  const existing = await Control.find({ controlId: new RegExp(`^${prefix}-`, 'i') })
    .select('controlId')
    .lean();

  const nums = existing
    .map(c => parseInt((c.controlId.split('-')[1] || '0'), 10))
    .filter(n => !isNaN(n));

  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${String(next).padStart(2, '0')}`;
}

// ── GET /api/controls ─────────────────────────────────────────────────────────
exports.getMany = async (req, res) => {
  try {
    const { strategyId, capabilityId } = req.query;
    const query = {};
    if (strategyId)   query.strategyId   = strategyId;
    if (capabilityId) query.capabilityId = capabilityId;

    const controls = await Control.find(query).lean();

    // Deduplicate by controlId
    const seen = new Map();
    controls.forEach(c => { if (!seen.has(c.controlId)) seen.set(c.controlId, c); });
    const unique = Array.from(seen.values());

    res.json({ success: true, data: unique, meta: { count: unique.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── GET /api/controls/:id ─────────────────────────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const control = await Control
      .findOne({ controlId: req.params.id })
      .populate('ownerId', 'fullName email businessUnit')
      .lean();

    if (!control) {
      return res.status(404).json({ success: false, error: 'Control not found', code: 404 });
    }

    // Attach legacy tools via old string-key mapping (backward compat)
    const mappings = await ControlToolMapping.find({ controlId: req.params.id });
    const toolIds  = mappings.map(m => m.toolId);
    const tools    = await Tool.find({ toolId: { $in: toolIds } });
    control.tools  = tools;

    res.json({ success: true, data: control, meta: { count: 1 } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── GET /api/controls/suggest-id ─────────────────────────────────────────────
exports.suggestId = async (req, res) => {
  try {
    const { category } = req.query;
    if (!category) {
      return res.status(400).json({ success: false, error: 'category query param required', code: 'VALIDATION_ERROR' });
    }
    const id = await suggestControlId(category);
    res.json({ success: true, data: { suggestedId: id } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── POST /api/controls ───────────────────────────────────────────────────────
exports.createControl = async (req, res) => {
  try {
    let { controlId, title, description, category, riskLevel, capabilityId, strategyId, ownerId, linkedTools } = req.body;

    // Required field validation
    if (!title)       return res.status(400).json({ success: false, error: 'title is required',       code: 'VALIDATION_ERROR' });
    if (!description) return res.status(400).json({ success: false, error: 'description is required', code: 'VALIDATION_ERROR' });
    if (!category)    return res.status(400).json({ success: false, error: 'category is required',    code: 'VALIDATION_ERROR' });
    if (!riskLevel)   return res.status(400).json({ success: false, error: 'riskLevel is required',   code: 'VALIDATION_ERROR' });
    if (!capabilityId) return res.status(400).json({ success: false, error: 'capabilityId is required', code: 'VALIDATION_ERROR' });

    // Auto-suggest controlId if not provided
    if (!controlId) {
      controlId = await suggestControlId(category);
    }

    // Check uniqueness
    const existing = await Control.findOne({ controlId });
    if (existing) {
      return res.status(409).json({ success: false, error: `Control ID "${controlId}" already exists`, code: 'DUPLICATE_ID' });
    }

    const now = new Date();
    const control = await Control.create({
      controlId,
      // Legacy alias fields
      controlName:        title,
      controlDescription: description,
      controlDomain:      category,
      // Phase 3 fields
      title,
      description,
      category,
      riskLevel,
      capabilityId,
      strategyId: strategyId || '',
      ownerId:     ownerId    || null,
      linkedTools: linkedTools || [],
      lifecycleStage: 'Defined',
      atRisk: false,
      lifecycleHistory: [{
        stage:     'Defined',
        changedBy: req.user._id,
        changedAt: now,
        reason:    'Control created'
      }],
      createdBy: req.user._id,
      createdAt: now,
      updatedAt: now
    });

    res.status(201).json({ success: true, data: control });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── PUT /api/controls/:controlId ─────────────────────────────────────────────
exports.updateControl = async (req, res) => {
  try {
    const control = await Control.findOne({ controlId: req.params.controlId });
    if (!control) {
      return res.status(404).json({ success: false, error: 'Control not found', code: 404 });
    }

    const allowedFields = ['title', 'description', 'category', 'riskLevel', 'capabilityId', 'strategyId', 'ownerId', 'linkedTools'];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        control[field] = req.body[field];
        // Keep legacy alias fields in sync
        if (field === 'title')       control.controlName        = req.body[field];
        if (field === 'description') control.controlDescription = req.body[field];
        if (field === 'category')    control.controlDomain      = req.body[field];
      }
    }

    control.updatedAt = new Date();
    await control.save();

    res.json({ success: true, data: control });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── PATCH /api/controls/:controlId/lifecycle ──────────────────────────────────
exports.updateLifecycle = async (req, res) => {
  try {
    const { action, reason } = req.body;

    if (!['advance', 'revert'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action must be "advance" or "revert"', code: 'VALIDATION_ERROR' });
    }

    const control = await Control.findOne({ controlId: req.params.controlId });
    if (!control) {
      return res.status(404).json({ success: false, error: 'Control not found', code: 404 });
    }

    const currentIdx = STAGES.indexOf(control.lifecycleStage);
    if (currentIdx === -1) {
      // Recover gracefully if stage is not in enum (e.g. old data)
      control.lifecycleStage = 'Defined';
    }

    let newStage;
    if (action === 'advance') {
      if (currentIdx >= STAGES.length - 1) {
        return res.status(400).json({ success: false, error: 'Control is already at the final stage (Review)', code: 'INVALID_TRANSITION' });
      }
      newStage = STAGES[currentIdx + 1];
    } else {
      // revert
      if (!reason || !reason.trim()) {
        return res.status(400).json({ success: false, error: 'Reason is required when reverting a lifecycle stage', code: 'VALIDATION_ERROR' });
      }
      if (currentIdx <= 0) {
        return res.status(400).json({ success: false, error: 'Control is already at the first stage (Defined)', code: 'INVALID_TRANSITION' });
      }
      newStage = STAGES[currentIdx - 1];
    }

    control.lifecycleStage = newStage;
    control.lifecycleHistory.push({
      stage:     newStage,
      changedBy: req.user._id,
      changedAt: new Date(),
      reason:    reason || null
    });
    control.updatedAt = new Date();
    await control.save();

    res.json({ success: true, data: control });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── PATCH /api/controls/:controlId/at-risk ───────────────────────────────────
exports.toggleAtRisk = async (req, res) => {
  try {
    const { atRisk } = req.body;
    if (typeof atRisk !== 'boolean') {
      return res.status(400).json({ success: false, error: 'atRisk must be a boolean', code: 'VALIDATION_ERROR' });
    }

    const control = await Control.findOne({ controlId: req.params.controlId });
    if (!control) {
      return res.status(404).json({ success: false, error: 'Control not found', code: 404 });
    }

    control.atRisk    = atRisk;
    control.updatedAt = new Date();
    await control.save();

    res.json({ success: true, data: control });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── GET /api/controls/:controlId/history ─────────────────────────────────────
exports.getLifecycleHistory = async (req, res) => {
  try {
    const control = await Control
      .findOne({ controlId: req.params.controlId })
      .populate('lifecycleHistory.changedBy', 'fullName email')
      .lean();

    if (!control) {
      return res.status(404).json({ success: false, error: 'Control not found', code: 404 });
    }

    res.json({ success: true, data: control.lifecycleHistory || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.getControlsSummary = async (req, res) => {
  try {
    const { strategyId, capabilityId } = req.query;
    const query = {};
    if (strategyId) query.strategyId = strategyId;
    if (capabilityId) query.capabilityId = capabilityId;
    
    // For Risk filters or others if passed
    if (req.query.risk) query.riskLevel = req.query.risk;
    if (req.query.atRisk === 'true') query.atRisk = true;
    
    const allControls = await Control.find(query).lean();
    
    // Deduplicate by controlId
    const seen = new Map();
    allControls.forEach(c => { if (!seen.has(c.controlId)) seen.set(c.controlId, c); });
    const unique = Array.from(seen.values());
    
    const total = unique.length;
    let implemented = 0;
    let pending = 0;
    let atRisk = 0;
    
    unique.forEach(c => {
      if (c.atRisk) atRisk++;
      
      if (['Implemented', 'Evidence Added', 'Validated', 'Review'].includes(c.lifecycleStage)) {
        implemented++;
      } else {
        pending++;
      }
    });
    
    res.json({
      success: true,
      data: { total, implemented, pending, atRisk }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.getControlsByCategory = async (req, res) => {
  try {
    const { strategyId, capabilityId } = req.query;
    const query = {};
    if (strategyId) query.strategyId = strategyId;
    if (capabilityId) query.capabilityId = capabilityId;
    
    const allControls = await Control.find(query).lean();
    
    // Deduplicate by controlId
    const seen = new Map();
    allControls.forEach(c => { if (!seen.has(c.controlId)) seen.set(c.controlId, c); });
    const unique = Array.from(seen.values());
    
    const byCategory = unique.reduce((acc, c) => {
      const cat = c.category || c.controlDomain || 'Uncategorized';
      if (!acc[cat]) acc[cat] = { category: cat, count: 0 };
      acc[cat].count++;
      return acc;
    }, {});
    
    res.json({
      success: true,
      data: Object.values(byCategory).sort((a, b) => b.count - a.count)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};
