const Capability = require('../models/Capability');
const Control = require('../models/Control');
const ControlToolMapping = require('../models/ControlToolMapping');
const Tool = require('../models/Tool');

exports.getByStrategy = async (req, res) => {
  try {
    const { strategyId } = req.query;
    const query = {};
    if (strategyId) {
      query.strategyId = strategyId;
    }
    const capabilities = await Capability.find(query).lean();
    
    // Calculate progress for each capability
    const allControls = await Control.find(query).lean();
    
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
    
    // Hydrate tools mapped directly to capability
    const CapabilityToolMapping = require('../models/CapabilityToolMapping');
    const mappings = await CapabilityToolMapping.find({ capabilityId: capability._id });
    const toolIds = mappings.map(m => m.toolId);
    const tools = await Tool.find({ _id: { $in: toolIds } });
    capability.tools = tools;
    
    // Legacy: hydrate tools on controls
    for (let control of controls) {
      const cMappings = await ControlToolMapping.find({ controlId: control.controlId });
      const cToolIds = cMappings.map(m => m.toolId);
      const cTools = await Tool.find({ toolId: { $in: cToolIds } });
      
      const Phase3ToolControlMapping = require('../models/Phase3ToolControlMapping');
      const p3Mappings = await Phase3ToolControlMapping.find({ controlId: control._id });
      const p3ToolIds = p3Mappings.map(m => m.toolId);
      const p3Tools = await Tool.find({ _id: { $in: p3ToolIds } }).lean();
      
      control.tools = [...cTools, ...p3Tools];
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
