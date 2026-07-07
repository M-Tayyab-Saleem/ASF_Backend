const mongoose = require('mongoose');
const Control = require('../models/Control');
const User = require('../models/User');
const Evidence = require('../models/Evidence');
const Strategy = require('../models/Strategy');
const Capability = require('../models/Capability');
const Tool = require('../models/Tool');

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
    status: c.status || 'Pending',
    lifecycleStage: c.lifecycleStage || 'Defined',
    atRisk: c.atRisk || false
  }));

  const atRiskControls = allControls.filter(c => c.atRisk);
  const atRiskCount = atRiskControls.length;

  // Group top risk areas
  const topRiskAreas = Object.values(atRiskControls.reduce((acc, c) => {
    const key = c.controlName; // Or group by category
    if (!acc[key]) {
      acc[key] = { area: c.controlName, count: 0, level: c.riskLevel || 'High' };
    }
    acc[key].count++;
    return acc;
  }, {})).sort((a, b) => b.count - a.count).slice(0, 5);

  // Recent evidence
  const recentEvidenceDocs = await Evidence.find(query)
    .sort({ uploadedAt: -1 })
    .limit(5)
    .populate('controlId', 'controlId controlName')
    .lean();
  
  const recentEvidence = recentEvidenceDocs.map(e => ({
    evidenceId: e._id,
    fileName: e.fileName,
    controlName: e.controlId?.controlName || 'Unknown Control',
    uploadedAt: e.uploadedAt
  }));

  const byLifecycle = {
    defined:       allControls.filter(c => c.lifecycleStage === 'Defined').length,
    implemented:   allControls.filter(c => c.lifecycleStage === 'Implemented').length,
    evidenceAdded: allControls.filter(c => c.lifecycleStage === 'Evidence Added').length,
    validated:     allControls.filter(c => c.lifecycleStage === 'Validated').length,
    review:        allControls.filter(c => c.lifecycleStage === 'Review').length,
  };

  const allTools = await Tool.find().populate('ownerId', 'fullName email').lean();
  
  let mostEffectiveTool = null;
  let leastEffectiveTool = null;
  
  if (allTools.length > 0) {
    const toolsWithScores = allTools.filter(t => t.effectivenessScore !== null && t.effectivenessScore !== undefined);
    if (toolsWithScores.length > 0) {
      mostEffectiveTool = toolsWithScores.reduce((prev, current) => (prev.effectivenessScore > current.effectivenessScore) ? prev : current);
      leastEffectiveTool = toolsWithScores.reduce((prev, current) => (prev.effectivenessScore < current.effectivenessScore) ? prev : current);
    }
  }

  const toolStats = {
    total: allTools.length,
    active: allTools.filter(t => t.status === 'Active' || t.status === 'In Use').length,
    underEvaluation: allTools.filter(t => t.status === 'Under Evaluation' || t.status === 'Pilot').length,
    decommissioned: allTools.filter(t => t.status === 'Decommissioned' || t.status === 'Retired').length,
    avgEffectiveness: allTools.length > 0 
        ? Math.round(allTools.reduce((acc, t) => acc + (t.effectivenessScore || 0), 0) / allTools.length)
        : 0,
    avgCoverage: allTools.length > 0
        ? Math.round(allTools.reduce((acc, t) => acc + (t.coverageScore || 0), 0) / allTools.length)
        : 0,
    mostEffective: mostEffectiveTool ? { name: mostEffectiveTool.name || mostEffectiveTool.toolName, score: mostEffectiveTool.effectivenessScore } : null,
    leastEffective: leastEffectiveTool ? { name: leastEffectiveTool.name || leastEffectiveTool.toolName, score: leastEffectiveTool.effectivenessScore } : null
  };

  const byToolCategory = allTools.reduce((acc, tool) => {
      const cat = tool.category || 'Other';
      if (!acc[cat]) acc[cat] = { category: cat, count: 0, avgEffectiveness: 0, totalEffectiveness: 0 };
      acc[cat].count++;
      acc[cat].totalEffectiveness += (tool.effectivenessScore || 0);
      return acc;
  }, {});

  Object.values(byToolCategory).forEach(cat => {
      cat.avgEffectiveness = Math.round(cat.totalEffectiveness / cat.count);
      delete cat.totalEffectiveness;
  });

  return {
    stats: {
      totalControls,
      implemented:    { count: implemented,    percentage: totalControls > 0 ? Math.round((implemented    / totalControls) * 100) : 0 },
      pending:        { count: pending,         percentage: totalControls > 0 ? Math.round((pending         / totalControls) * 100) : 0 },
      notImplemented: { count: notImplemented,  percentage: totalControls > 0 ? Math.round((notImplemented / totalControls) * 100) : 0 },
      atRisk:         { count: atRiskCount,     percentage: totalControls > 0 ? Math.round((atRiskCount     / totalControls) * 100) : 0 },
      byLifecycle,
      tools: toolStats
    },
    topRiskAreas,
    recentEvidence,
    toolsInventory: allTools,
    byStrategy,
    byCapability,
    byControl,
    byToolCategory: Object.values(byToolCategory)
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

const getQueryForUser = async (userId, isAdmin) => {
  if (isAdmin) return {};
  const userEvidence = await Evidence.distinct('controlId', { uploadedBy: new mongoose.Types.ObjectId(userId) });
  return { controlId: { $in: userEvidence } };
};

exports.getImplementationProgress = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const query = await getQueryForUser(req.user._id, isAdmin);
    const allControls = await Control.find(query).lean();
    
    const byCategory = allControls.reduce((acc, c) => {
      const cat = c.category || c.controlDomain || 'Uncategorized';
      if (!acc[cat]) acc[cat] = { category: cat, total: 0, implemented: 0, pending: 0, atRisk: 0 };
      
      acc[cat].total++;
      if (c.atRisk) {
        acc[cat].atRisk++;
      } else if (['Implemented', 'Evidence Added', 'Validated', 'Review'].includes(c.lifecycleStage)) {
        acc[cat].implemented++;
      } else {
        acc[cat].pending++;
      }
      return acc;
    }, {});
    
    res.json({ success: true, data: Object.values(byCategory) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getImplementationTrend = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const query = await getQueryForUser(req.user._id, isAdmin);
    const allControls = await Control.find(query).lean();
    
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d);
    }
    
    const trend = months.map((monthDate) => {
      const endOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      let implementedCount = 0;
      
      allControls.forEach(c => {
         let implDate = null;
         const implHistory = c.lifecycleHistory?.find(h => ['Implemented', 'Evidence Added', 'Validated', 'Review'].includes(h.stage));
         if (implHistory) {
           implDate = new Date(implHistory.changedAt);
         } else if (['Implemented', 'Evidence Added', 'Validated', 'Review'].includes(c.lifecycleStage)) {
           implDate = new Date(c.updatedAt || c.createdAt);
         }
         
         if (implDate && implDate <= endOfMonth) {
           implementedCount++;
         }
      });
      
      return {
        month: monthDate.toLocaleString('default', { month: 'short', year: '2-digit' }),
        implementedPct: allControls.length > 0 ? Math.round((implementedCount / allControls.length) * 100) : 0
      };
    });
    
    res.json({ success: true, data: trend });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getTopRiskAreas = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const query = await getQueryForUser(req.user._id, isAdmin);
    const allControls = await Control.find(query).lean();
    
    const atRiskControls = allControls.filter(c => c.atRisk);
    const byCategory = atRiskControls.reduce((acc, c) => {
      const cat = c.category || c.controlDomain || 'Uncategorized';
      if (!acc[cat]) acc[cat] = { category: cat, count: 0 };
      acc[cat].count++;
      return acc;
    }, {});
    
    const topRiskAreas = Object.values(byCategory).map(area => {
      let level = 'Low';
      if (area.count >= 5) level = 'High';
      else if (area.count >= 2) level = 'Medium';
      return { area: area.category, count: area.count, level };
    }).sort((a, b) => b.count - a.count).slice(0, 5);
    
    res.json({ success: true, data: topRiskAreas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getRecentEvidence = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    let evidenceQuery = {};
    if (!isAdmin) {
      evidenceQuery = { uploadedBy: new mongoose.Types.ObjectId(req.user._id) };
    }
    
    let limit = 5;
    if (req.query.limit) {
      limit = parseInt(req.query.limit, 10);
    }
    
    let queryObj = Evidence.find(evidenceQuery).sort({ uploadedAt: -1 });
    if (limit > 0) {
      queryObj = queryObj.limit(limit);
    }
    const recentEvidenceDocs = await queryObj.lean();
      
    const controlIds = recentEvidenceDocs.map(e => e.controlId);
    const controls = await Control.find({ controlId: { $in: controlIds } }).lean();
    const controlMap = controls.reduce((acc, c) => {
      acc[c.controlId] = { name: c.controlName || c.title, category: c.category || c.controlDomain };
      return acc;
    }, {});
    
    const recentEvidence = recentEvidenceDocs.map(e => ({
      evidenceId: e._id,
      fileName: e.fileName,
      fileType: e.fileType,
      controlName: controlMap[e.controlId]?.name || 'Unknown Control',
      category: controlMap[e.controlId]?.category || 'Uncategorized',
      uploadedAt: e.uploadedAt
    }));
    
    res.json({ success: true, data: recentEvidence });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
