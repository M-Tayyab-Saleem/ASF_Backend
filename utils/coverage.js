const Tool = require('../models/Tool');
const Control = require('../models/Control');
const Phase3ToolControlMapping = require('../models/Phase3ToolControlMapping');

/**
 * Recalculates the coverageScore for a specific tool.
 * Coverage = (mappedControls / totalControls) * 100
 * 
 * @param {ObjectId} toolId - The _id of the Tool
 * @returns {Promise<number>} - The new coverage score
 */
const recalculateCoverage = async (toolId) => {
  try {
    const totalControls = await Control.countDocuments();
    if (totalControls === 0) return 0;

    const mappedControls = await Phase3ToolControlMapping.countDocuments({ toolId });
    
    const coverageScore = Math.round((mappedControls / totalControls) * 100);

    await Tool.findByIdAndUpdate(toolId, { coverageScore });

    return coverageScore;
  } catch (error) {
    console.error(`Error recalculating coverage for tool ${toolId}:`, error);
    return 0; // Better to return 0 than crash
  }
};

/**
 * Recalculates coverage for all tools in the system.
 * Useful after a bulk migration or when a new control is added/deleted.
 */
const recalculateAllCoverage = async () => {
  try {
    const tools = await Tool.find().select('_id');
    for (const tool of tools) {
      await recalculateCoverage(tool._id);
    }
    return true;
  } catch (error) {
    console.error('Error recalculating all coverage:', error);
    return false;
  }
};

module.exports = {
  recalculateCoverage,
  recalculateAllCoverage
};
