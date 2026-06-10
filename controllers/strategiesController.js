const Strategy = require('../models/Strategy');

exports.getAll = async (req, res) => {
  try {
    const strategies = await Strategy.find({}).sort('strategyId');
    res.json({
      success: true,
      data: strategies,
      meta: { count: strategies.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.getOne = async (req, res) => {
  try {
    const strategy = await Strategy.findOne({ strategyId: req.params.id });
    if (!strategy) {
      return res.status(404).json({ success: false, error: 'Strategy not found', code: 404 });
    }
    res.json({
      success: true,
      data: strategy,
      meta: { strategyId: strategy.strategyId }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};
