const express = require('express');
const router = express.Router();
const Strategy = require('../models/Strategy');
const Capability = require('../models/Capability');
const Control = require('../models/Control');
const Tool = require('../models/Tool');

router.get('/', async (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q) {
      return res.json({ success: true, data: { strategies: [], capabilities: [], controls: [], tools: [] }, meta: { total: 0 }});
    }

    const regex = new RegExp(q, 'i');
    
    const [strategies, capabilities, controls, tools] = await Promise.all([
      Strategy.find({ $or: [{ strategyName: regex }, { strategyDescription: regex }] }),
      Capability.find({ $or: [{ capabilityName: regex }, { capabilityDescription: regex }] }),
      Control.find({ $or: [{ controlName: regex }, { controlDescription: regex }, { controlObjective: regex }] }),
      Tool.find({ $or: [{ toolName: regex }, { toolDescription: regex }] })
    ]);

    const total = strategies.length + capabilities.length + controls.length + tools.length;

    res.json({
      success: true,
      data: {
        strategies,
        capabilities,
        controls,
        tools
      },
      meta: { total }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
});

module.exports = router;
