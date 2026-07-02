const mongoose = require('mongoose');
const Control = require('../models/Control');
const User = require('../models/User');
const Evidence = require('../models/Evidence');
const Strategy = require('../models/Strategy');
const Capability = require('../models/Capability');

const buildDashboardData = async (userId = null) => {
  let query = {};
  if (userId) {
    const userEvidence = await Evidence.distinct('controlId', { uploadedBy: new mongoose.Types.ObjectId(userId) });
    query = { controlId: { $in: userEvidence } };
  }

  const allControls = await Control.find(query).lean();
  const totalControls = allControls.length;

  const implemented = allControls.filter(c => c.status === 'Implemented').length;
  const pending = allControls.filter(c => c.status === 'Pending' || !c.status).length;
  const notImplemented = allControls.filter(c => c.status === 'Not Implemented').length;

  const strategies = await Strategy.find().lean();
  const capabilities = await Capability.find().lean();

  const byStrategy = strategies.map(strategy => {
    const strategyControls = allControls.filter(c => c.strategyId === strategy.strategyId);
    const total = strategyControls.length;
    return {
      strategyId: strategy.strategyId,
      strategyName: strategy.strategyName,
      implemented: strategyControls.filter(c => c.status === 'Implemented').length,
      pending: strategyControls.filter(c => c.status === 'Pending' || !c.status).length,
      notImplemented: strategyControls.filter(c => c.status === 'Not Implemented').length,
      total
    };
  }).filter(s => s.total > 0);

  const byCapability = capabilities.map(cap => {
    const capControls = allControls.filter(c => c.capabilityId === cap.capabilityId);
    const total = capControls.length;
    return {
      capabilityId: cap.capabilityId,
      capabilityName: cap.capabilityName,
      implemented: capControls.filter(c => c.status === 'Implemented').length,
      pending: capControls.filter(c => c.status === 'Pending' || !c.status).length,
      notImplemented: capControls.filter(c => c.status === 'Not Implemented').length,
      total
    };
  }).filter(c => c.total > 0);

  const byControl = allControls.map(c => ({
    controlId: c.controlId,
    controlName: c.controlName,
    status: c.status || 'Pending'
  }));

  return {
    stats: {
      totalControls,
      implemented: { count: implemented, percentage: totalControls > 0 ? Math.round((implemented / totalControls) * 100) : 0 },
      pending: { count: pending, percentage: totalControls > 0 ? Math.round((pending / totalControls) * 100) : 0 },
      notImplemented: { count: notImplemented, percentage: totalControls > 0 ? Math.round((notImplemented / totalControls) * 100) : 0 }
    },
    byStrategy,
    byCapability,
    byControl
  };
};

exports.getMyDashboard = async (req, res) => {
  try {
    const data = await buildDashboardData(req.user._id);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.getUserDashboard = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found', code: 'NOT_FOUND' });
    }
    const data = await buildDashboardData(req.params.userId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.getAllDashboard = async (req, res) => {
  try {
    const data = await buildDashboardData(null);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select('fullName email role').sort({ fullName: 1 });
    res.json({ success: true, data: users, meta: { count: users.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};
