const Control = require('../models/Control');
const ControlToolMapping = require('../models/ControlToolMapping');
const Tool = require('../models/Tool');

exports.getMany = async (req, res) => {
  try {
    const { strategyId, capabilityId } = req.query;
    let query = {};
    if (strategyId) query.strategyId = strategyId;
    if (capabilityId) query.capabilityId = capabilityId;

    const controls = await Control.find(query);
    
    // Deduplicate controls by controlId
    const uniqueControlsMap = new Map();
    controls.forEach(ctrl => {
      if (!uniqueControlsMap.has(ctrl.controlId)) {
        uniqueControlsMap.set(ctrl.controlId, ctrl);
      }
    });
    const uniqueControls = Array.from(uniqueControlsMap.values());

    res.json({
      success: true,
      data: uniqueControls,
      meta: { count: uniqueControls.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.getOne = async (req, res) => {
  try {
    const controlId = req.params.id;
    const control = await Control.findOne({ controlId }).lean();
    if (!control) {
      return res.status(404).json({ success: false, error: 'Control not found', code: 404 });
    }

    const mappings = await ControlToolMapping.find({ controlId });
    const toolIds = mappings.map(m => m.toolId);
    const tools = await Tool.find({ toolId: { $in: toolIds } });
    
    control.tools = tools;

    res.json({
      success: true,
      data: control,
      meta: { count: 1 }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};
