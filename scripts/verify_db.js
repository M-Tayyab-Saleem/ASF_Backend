const mongoose = require('mongoose');
const xlsx = require('xlsx');
require('dotenv').config({ path: '.env' }); // Adjusted path if running from scripts/

const Strategy = require('../models/Strategy');
const Capability = require('../models/Capability');
const Control = require('../models/Control');
const Tool = require('../models/Tool');
const CapabilityToolMapping = require('../models/CapabilityToolMapping');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const wb = xlsx.readFile('../MasterSheet.xlsx');
    
    // Read sheets
    const stratSheet = xlsx.utils.sheet_to_json(wb.Sheets['Strategies']);
    const capSheet = xlsx.utils.sheet_to_json(wb.Sheets['Capabilities ']);
    const ctrlSheet = xlsx.utils.sheet_to_json(wb.Sheets['Controls ']);
    const capCtrlMapSheet = xlsx.utils.sheet_to_json(wb.Sheets['CapabilityControlMapping']);
    const toolsSheet = xlsx.utils.sheet_to_json(wb.Sheets['Tools']);

    // Fetch DB
    const dbStrategies = await Strategy.find().lean();
    const dbCapabilities = await Capability.find().lean();
    const dbControls = await Control.find().lean();
    const dbTools = await Tool.find().lean();
    const dbCapToolMaps = await CapabilityToolMapping.find().populate('capabilityId toolId').lean();

    const report = {
      strategies: {
        masterCount: stratSheet.length,
        dbCount: dbStrategies.length,
        matched: 0,
        missingInDb: [],
        missingInMaster: []
      },
      capabilities: {
        masterCount: capSheet.length,
        dbCount: dbCapabilities.length,
        matched: 0,
        missingInDb: [],
        missingInMaster: [],
        mappingMatched: 0,
        mappingMismatched: []
      },
      controls: {
        masterCount: ctrlSheet.length,
        dbCount: dbControls.length,
        matched: 0,
        missingInDb: [],
        missingInMaster: [],
        mappingMatched: 0,
        mappingMismatched: []
      },
      tools: {
        masterCount: toolsSheet.length,
        dbCount: dbTools.length,
        matched: 0,
        missingInDb: [],
        missingInMaster: []
      }
    };

    // Strategies
    const masterStratIds = stratSheet.map(s => String(s['Strategy ID']).trim());
    const dbStratIds = dbStrategies.map(s => String(s.strategyId).trim());
    
    masterStratIds.forEach(id => {
      if (dbStratIds.includes(id)) report.strategies.matched++;
      else report.strategies.missingInDb.push(id);
    });
    dbStratIds.forEach(id => {
      if (!masterStratIds.includes(id)) report.strategies.missingInMaster.push(id);
    });

    // Capabilities
    const masterCapMap = new Map();
    capSheet.forEach(c => {
      // Find the correct key for Capability ID (may have trailing spaces)
      const capIdKey = Object.keys(c).find(k => k.trim() === 'Capability ID');
      const stratIdKey = Object.keys(c).find(k => k.trim() === 'Strategy ID');
      if (!capIdKey || !stratIdKey) return;
      const cId = String(c[capIdKey]).trim();
      let sId = String(c[stratIdKey]).trim();
      if (sId === 'RAG') sId = 'RG'; // mapping logic from data.py
      masterCapMap.set(cId, { strategyId: sId });
    });

    const dbCapMap = new Map();
    dbCapabilities.forEach(c => {
      dbCapMap.set(String(c.capabilityId).trim(), { strategyId: String(c.strategyId).trim() });
    });

    for (let [cId, masterData] of masterCapMap.entries()) {
      if (dbCapMap.has(cId)) {
        report.capabilities.matched++;
        const dbData = dbCapMap.get(cId);
        if (masterData.strategyId === dbData.strategyId) {
          report.capabilities.mappingMatched++;
        } else {
          report.capabilities.mappingMismatched.push({ capId: cId, masterStrat: masterData.strategyId, dbStrat: dbData.strategyId });
        }
      } else {
        report.capabilities.missingInDb.push(cId);
      }
    }
    for (let cId of dbCapMap.keys()) {
      if (!masterCapMap.has(cId)) report.capabilities.missingInMaster.push(cId);
    }

    // Controls
    // Master Mapping cap -> ctrl
    const masterCtrlToCap = new Map();
    capCtrlMapSheet.forEach(row => {
      const capIdKey = Object.keys(row).find(k => k.trim() === 'Capability ID');
      const ctrlIdKey = Object.keys(row).find(k => k.trim() === 'Control ID');
      if (capIdKey && ctrlIdKey) {
        masterCtrlToCap.set(String(row[ctrlIdKey]).trim(), String(row[capIdKey]).trim());
      }
    });

    const masterCtrlIds = ctrlSheet.map(c => String(c['Control ID']).trim());
    
    const dbCtrlMap = new Map();
    dbControls.forEach(c => {
      // old field controlId is used, or maybe phase 3 uses something else? Control.js has controlId
      dbCtrlMap.set(String(c.controlId).trim(), { capabilityId: String(c.capabilityId).trim() });
    });

    masterCtrlIds.forEach(id => {
      if (dbCtrlMap.has(id)) {
        report.controls.matched++;
        const dbData = dbCtrlMap.get(id);
        const masterCap = masterCtrlToCap.get(id);
        if (masterCap === dbData.capabilityId) {
          report.controls.mappingMatched++;
        } else {
          report.controls.mappingMismatched.push({ ctrlId: id, masterCap, dbCap: dbData.capabilityId });
        }
      } else {
        report.controls.missingInDb.push(id);
      }
    });

    for (let cId of dbCtrlMap.keys()) {
      if (!masterCtrlIds.includes(cId)) report.controls.missingInMaster.push(cId);
    }

    // Tools
    const masterToolIds = toolsSheet.map(t => String(t['ToolID'] || t['Tool ID']).trim());
    const dbToolIds = dbTools.map(t => String(t.toolId).trim());
    
    masterToolIds.forEach(id => {
      if (dbToolIds.includes(id)) report.tools.matched++;
      else report.tools.missingInDb.push(id);
    });
    dbToolIds.forEach(id => {
      if (!masterToolIds.includes(id)) report.tools.missingInMaster.push(id);
    });

    console.log(JSON.stringify(report, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
  }
}

run();
