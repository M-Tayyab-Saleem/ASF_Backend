const Phase3ToolControlMapping = require('../models/Phase3ToolControlMapping');
const Tool = require('../models/Tool');
const Control = require('../models/Control');
const { recalculateCoverage } = require('../utils/coverage');

// ── GET /api/tool-mappings ──────────────────────────────────────────────────
exports.getMappings = async (req, res) => {
  try {
    const { toolId, controlId } = req.query;
    const query = {};
    if (toolId) query.toolId = toolId;
    if (controlId) query.controlId = controlId;

    const mappings = await Phase3ToolControlMapping.find(query)
      .populate('toolId', 'toolId name category status effectivenessScore coverageScore')
      .populate('controlId', 'controlId title lifecycleStage atRisk riskLevel')
      .populate('createdBy', 'fullName email')
      .lean();

    res.json({ success: true, data: mappings, meta: { count: mappings.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── POST /api/tool-mappings ─────────────────────────────────────────────────
exports.addMapping = async (req, res) => {
  try {
    const { toolId, controlId, description, verified } = req.body;

    if (!toolId || !controlId) {
      return res.status(400).json({ success: false, error: 'toolId and controlId are required', code: 'VALIDATION_ERROR' });
    }

    const tool = await Tool.findById(toolId);
    if (!tool) return res.status(404).json({ success: false, error: 'Tool not found', code: 'NOT_FOUND' });

    const control = await Control.findById(controlId);
    if (!control) return res.status(404).json({ success: false, error: 'Control not found', code: 'NOT_FOUND' });

    const existing = await Phase3ToolControlMapping.findOne({ toolId, controlId });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Mapping already exists', code: 'DUPLICATE_MAPPING' });
    }

    const mapping = await Phase3ToolControlMapping.create({
      toolId,
      controlId,
      description: description || '',
      verified: verified !== undefined ? verified : false,
      createdBy: req.user._id
    });

    // Update Control's linkedTools array
    if (!control.linkedTools.includes(toolId)) {
        control.linkedTools.push(toolId);
        await control.save();
    }

    // Recalculate Tool Coverage
    const coverageScore = await recalculateCoverage(toolId);

    res.status(201).json({ success: true, data: { mapping, coverageScore } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── DELETE /api/tool-mappings/:id ───────────────────────────────────────────
exports.removeMapping = async (req, res) => {
  try {
    const mapping = await Phase3ToolControlMapping.findById(req.params.id);
    if (!mapping) {
      return res.status(404).json({ success: false, error: 'Mapping not found', code: 'NOT_FOUND' });
    }

    const { toolId, controlId } = mapping;

    await Phase3ToolControlMapping.findByIdAndDelete(req.params.id);

    // Update Control's linkedTools array
    const control = await Control.findById(controlId);
    if (control) {
        control.linkedTools = control.linkedTools.filter(tId => tId.toString() !== toolId.toString());
        await control.save();
    }

    // Recalculate Tool Coverage
    const coverageScore = await recalculateCoverage(toolId);

    res.json({ success: true, data: { message: 'Mapping removed', coverageScore } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── DELETE /api/tool-mappings?toolId=...&controlId=... ─────────────────────
exports.removeMappingByToolAndControl = async (req, res) => {
  try {
    const { toolId, controlId } = req.query;
    if (!toolId || !controlId) {
      return res.status(400).json({ success: false, error: 'toolId and controlId are required', code: 'VALIDATION_ERROR' });
    }

    const mapping = await Phase3ToolControlMapping.findOne({ toolId, controlId });
    if (mapping) {
      await Phase3ToolControlMapping.findByIdAndDelete(mapping._id);
    }

    // Update Control's linkedTools array
    const control = await Control.findById(controlId);
    if (control) {
        control.linkedTools = control.linkedTools.filter(tId => tId.toString() !== toolId.toString());
        await control.save();
    }

    // Recalculate Tool Coverage
    const coverageScore = await recalculateCoverage(toolId);

    res.json({ success: true, data: { message: 'Mapping removed', coverageScore } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};
