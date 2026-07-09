const mongoose = require('mongoose');
const Tool = require('../models/Tool');
const Control = require('../models/Control');
const Phase3ToolControlMapping = require('../models/Phase3ToolControlMapping');
const { TOOL_CATEGORIES } = require('../models/Tool');

// ── GET /api/tools ──────────────────────────────────────────────────────────
exports.getMany = async (req, res) => {
  try {
    const tools = await Tool.find()
      .populate('ownerId', 'fullName email businessUnit')
      .sort({ name: 1, toolName: 1 })
      .lean();

    res.json({ success: true, data: tools, meta: { count: tools.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── GET /api/tools/:id ──────────────────────────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    // Support querying by ObjectId or legacy string toolId
    const query = mongoose.isValidObjectId(req.params.id) 
        ? { _id: req.params.id }
        : { toolId: req.params.id };

    const tool = await Tool.findOne(query)
      .populate('ownerId', 'fullName email businessUnit phone')
      .lean();

    if (!tool) {
      return res.status(404).json({ success: false, error: 'Tool not found', code: 404 });
    }

    // Fetch mapped controls
    const mappings = await Phase3ToolControlMapping.find({ toolId: tool._id })
        .populate('controlId', 'controlId title controlName status lifecycleStage atRisk riskLevel')
        .lean();
    
    tool.mappedControls = mappings.map(m => m.controlId).filter(Boolean);

    res.json({ success: true, data: tool, meta: { count: 1 } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── POST /api/tools ─────────────────────────────────────────────────────────
exports.createTool = async (req, res) => {
  try {
    const { toolId, name, category, vendor, description, status, ownerId, tags, primaryFunction, aiControlRelevance } = req.body;

    if (!toolId || !name || !category) {
      return res.status(400).json({ success: false, error: 'toolId, name, and category are required', code: 'VALIDATION_ERROR' });
    }

    if (category !== 'Other' && !TOOL_CATEGORIES.includes(category)) {
        return res.status(400).json({ success: false, error: 'Invalid category', code: 'VALIDATION_ERROR' });
    }

    const existing = await Tool.findOne({ toolId });
    if (existing) {
      return res.status(409).json({ success: false, error: `Tool ID "${toolId}" already exists`, code: 'DUPLICATE_ID' });
    }

    const tool = await Tool.create({
      toolId,
      // Phase 3 aliases
      name,
      description: description || '',
      category,
      // Legacy aliases
      toolName: name,
      toolDescription: description || '',
      toolCategory: category,
      
      vendor: vendor || '',
      status: status || 'Active',
      ownerId: ownerId || null,
      tags: tags || [],
      primaryFunction: primaryFunction || '',
      aiControlRelevance: aiControlRelevance || ''
    });

    res.status(201).json({ success: true, data: tool });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── PUT /api/tools/:id ──────────────────────────────────────────────────────
exports.updateTool = async (req, res) => {
  try {
    // Support querying by ObjectId or legacy string toolId
    const query = mongoose.isValidObjectId(req.params.id) 
        ? { _id: req.params.id }
        : { toolId: req.params.id };

    const tool = await Tool.findOne(query);
    if (!tool) {
      return res.status(404).json({ success: false, error: 'Tool not found', code: 404 });
    }

    const allowedFields = ['name', 'description', 'category', 'vendor', 'status', 'ownerId', 'tags', 'primaryFunction', 'aiControlRelevance'];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        tool[field] = req.body[field];
        
        // Keep legacy alias fields in sync
        if (field === 'name')        tool.toolName        = req.body[field];
        if (field === 'description') tool.toolDescription = req.body[field];
        if (field === 'category')    tool.toolCategory    = req.body[field];
      }
    }

    if (req.body.category && req.body.category !== 'Other' && !TOOL_CATEGORIES.includes(req.body.category)) {
        return res.status(400).json({ success: false, error: 'Invalid category', code: 'VALIDATION_ERROR' });
    }

    tool.updatedAt = new Date();
    await tool.save();

    res.json({ success: true, data: tool });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── PATCH /api/tools/:id/effectiveness ──────────────────────────────────────
exports.setEffectiveness = async (req, res) => {
  try {
    const { score } = req.body;
    
    if (score !== null && (typeof score !== 'number' || score < 0 || score > 100)) {
        return res.status(400).json({ success: false, error: 'Score must be a number between 0 and 100, or null', code: 'VALIDATION_ERROR' });
    }

    const query = mongoose.isValidObjectId(req.params.id) 
        ? { _id: req.params.id }
        : { toolId: req.params.id };

    const tool = await Tool.findOne(query);
    if (!tool) {
      return res.status(404).json({ success: false, error: 'Tool not found', code: 404 });
    }

    tool.effectivenessScore = score;
    tool.updatedAt = new Date();
    await tool.save();

    res.json({ success: true, data: tool });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── DELETE /api/tools/:id ───────────────────────────────────────────────────
exports.deleteTool = async (req, res) => {
  try {
    const query = mongoose.isValidObjectId(req.params.id) 
        ? { _id: req.params.id }
        : { toolId: req.params.id };

    const tool = await Tool.findOne(query);
    if (!tool) {
      return res.status(404).json({ success: false, error: 'Tool not found', code: 404 });
    }

    await Tool.deleteOne(query);
    
    // Also remove mappings
    await Phase3ToolControlMapping.deleteMany({ toolId: tool._id });

    res.json({ success: true, data: { message: 'Tool deleted successfully' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── GET /api/tools/categories ───────────────────────────────────────────────
exports.getCategories = (req, res) => {
    res.json({ success: true, data: TOOL_CATEGORIES });
};
