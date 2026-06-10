const Tool = require('../models/Tool');
const ControlToolMapping = require('../models/ControlToolMapping');

exports.getTools = async (req, res) => {
  try {
    const { controlId } = req.query;
    if (controlId) {
      const mappings = await ControlToolMapping.find({ controlId });
      const toolIds = mappings.map(m => m.toolId);
      const tools = await Tool.find({ toolId: { $in: toolIds } });
      return res.json({
        success: true,
        data: tools,
        meta: { count: tools.length }
      });
    }

    const tools = await Tool.find({});
    res.json({
      success: true,
      data: tools,
      meta: { count: tools.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.getOne = async (req, res) => {
  try {
    const toolId = req.params.id;
    const tool = await Tool.findOne({ toolId });
    if (!tool) {
      return res.status(404).json({ success: false, error: 'Tool not found', code: 404 });
    }
    res.json({
      success: true,
      data: tool,
      meta: { count: 1 }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};
