const Capability = require('../models/Capability');
const Control = require('../models/Control');
const ControlToolMapping = require('../models/ControlToolMapping');
const Tool = require('../models/Tool');

exports.getByStrategy = async (req, res) => {
  try {
    const { strategyId } = req.query;
    if (!strategyId) {
      return res.status(400).json({ success: false, error: 'strategyId query param is required', code: 400 });
    }
    const capabilities = await Capability.find({ strategyId }).lean();
    
    // Calculate progress for each capability
    const allControls = await Control.find({ strategyId }).lean();
    
    for (let cap of capabilities) {
      const capControls = allControls.filter(c => c.capabilityId === cap.capabilityId);
      const total = capControls.length;
      let implemented = 0;
      capControls.forEach(c => {
         if (['Implemented', 'Evidence Added', 'Validated', 'Review'].includes(c.lifecycleStage)) {
           implemented++;
         }
      });
      cap.progress = total > 0 ? Math.round((implemented / total) * 100) : null;
      cap.totalControls = total;
    }

    res.json({
      success: true,
      data: capabilities,
      meta: { count: capabilities.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.getOne = async (req, res) => {
  try {
    const capabilityId = req.params.id;
    const capability = await Capability.findOne({ capabilityId }).lean();
    if (!capability) {
      return res.status(404).json({ success: false, error: 'Capability not found', code: 404 });
    }

    const controls = await Control.find({ capabilityId }).lean();
    
    // Hydrate tools
    for (let control of controls) {
      const mappings = await ControlToolMapping.find({ controlId: control.controlId });
      const toolIds = mappings.map(m => m.toolId);
      const tools = await Tool.find({ toolId: { $in: toolIds } });
      control.tools = tools;
    }
    
    capability.controls = controls;

    res.json({
      success: true,
      data: capability,
      meta: { count: 1 }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};
