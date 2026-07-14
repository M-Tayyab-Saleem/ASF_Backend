const CapabilityToolMapping = require('../models/CapabilityToolMapping');
const Tool = require('../models/Tool');
const Capability = require('../models/Capability');

// ── GET /api/capability-tool-mappings ─────────────────────────────────────────
exports.getMappings = async (req, res) => {
  try {
    const { toolId, capabilityId } = req.query;
    const query = {};
    if (toolId) query.toolId = toolId;
    if (capabilityId) query.capabilityId = capabilityId;

    const mappings = await CapabilityToolMapping.find(query)
      .populate('toolId', 'toolId name category status effectivenessScore coverageScore')
      .populate('capabilityId', 'capabilityId capabilityName capabilityCategory strategyId')
      .populate('createdBy', 'fullName email')
      .lean();

    res.json({ success: true, data: mappings, meta: { count: mappings.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── POST /api/capability-tool-mappings ────────────────────────────────────────
exports.addMapping = async (req, res) => {
  try {
    const { toolId, capabilityId, description, verified } = req.body;

    if (!toolId || !capabilityId) {
      return res.status(400).json({ success: false, error: 'toolId and capabilityId are required', code: 'VALIDATION_ERROR' });
    }

    const tool = await Tool.findById(toolId);
    if (!tool) return res.status(404).json({ success: false, error: 'Tool not found', code: 'NOT_FOUND' });

    const capability = await Capability.findById(capabilityId);
    if (!capability) return res.status(404).json({ success: false, error: 'Capability not found', code: 'NOT_FOUND' });

    const existing = await CapabilityToolMapping.findOne({ toolId, capabilityId });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Mapping already exists', code: 'DUPLICATE_MAPPING' });
    }

    const mapping = await CapabilityToolMapping.create({
      toolId,
      capabilityId,
      description: description || '',
      verified: verified !== undefined ? verified : false,
      createdBy: req.user._id
    });

    // Update Capability's linkedTools array
    if (!capability.linkedTools) capability.linkedTools = [];
    if (!capability.linkedTools.includes(toolId)) {
        capability.linkedTools.push(toolId);
        await capability.save();
    }

    res.status(201).json({ success: true, data: { mapping } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── DELETE /api/capability-tool-mappings/:id ──────────────────────────────────
exports.removeMapping = async (req, res) => {
  try {
    const mapping = await CapabilityToolMapping.findById(req.params.id);
    if (!mapping) {
      return res.status(404).json({ success: false, error: 'Mapping not found', code: 'NOT_FOUND' });
    }

    const { toolId, capabilityId } = mapping;

    await CapabilityToolMapping.findByIdAndDelete(req.params.id);

    // Update Capability's linkedTools array
    const capability = await Capability.findById(capabilityId);
    if (capability && capability.linkedTools) {
        capability.linkedTools = capability.linkedTools.filter(tId => tId.toString() !== toolId.toString());
        await capability.save();
    }

    res.json({ success: true, data: { message: 'Mapping removed' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── DELETE /api/capability-tool-mappings?toolId=...&capabilityId=... ──────────
exports.removeMappingByToolAndCapability = async (req, res) => {
  try {
    const { toolId, capabilityId } = req.query;
    if (!toolId || !capabilityId) {
      return res.status(400).json({ success: false, error: 'toolId and capabilityId are required', code: 'VALIDATION_ERROR' });
    }

    const mapping = await CapabilityToolMapping.findOne({ toolId, capabilityId });
    if (mapping) {
      await CapabilityToolMapping.findByIdAndDelete(mapping._id);
    }

    // Update Capability's linkedTools array
    const capability = await Capability.findById(capabilityId);
    if (capability && capability.linkedTools) {
        capability.linkedTools = capability.linkedTools.filter(tId => tId.toString() !== toolId.toString());
        await capability.save();
    }

    res.json({ success: true, data: { message: 'Mapping removed' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};
