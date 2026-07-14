const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const xlsx = require('xlsx');

const Control = require('../models/Control');
const Capability = require('../models/Capability');
const Strategy = require('../models/Strategy');
const Tool = require('../models/Tool');
const ControlToolMapping = require('../models/ControlToolMapping');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  // 3a. Duplicate Control documents
  const allControls = await Control.find({}).lean();
  const byId = {};
  for (const c of allControls) {
    if (!byId[c.controlId]) byId[c.controlId] = [];
    byId[c.controlId].push(c._id);
  }
  const dupes = Object.entries(byId).filter(([, ids]) => ids.length > 1);
  console.log('3a. Duplicates:', dupes.length);
  if (dupes.length > 0) {
    console.log(dupes);
  }

  // 3b. String-notes corruption
  const db = mongoose.connection.db;
  const bad = await db.collection('controls').find({ notes: { $type: 'string' } }).toArray();
  console.log('3b. Controls with string notes:', bad.map(c => c.controlId).length > 0 ? bad.map(c => c.controlId) : 0);

  // 3c. Internal consistency (control → capability → strategy)
  const caps = await Capability.find({}).lean();
  const capMap = new Map(caps.map(c => [c.capabilityId, c.strategyId]));

  const inconsistent = allControls.filter(c => {
    const capStratId = capMap.get(c.capabilityId);
    return capStratId && capStratId !== c.strategyId;
  });
  console.log('3c. Internally inconsistent:', inconsistent.length > 0 ? inconsistent.map(c =>
    `${c.controlId} ctrl.strat=${c.strategyId} cap.strat=${capMap.get(c.capabilityId)}`
  ) : 0);

  // Parse XLSX for missing items
  const workbook = xlsx.readFile(path.resolve(__dirname, '../../MasterSheet.xlsx'));
  
  // 3d. Missing controls
  const controlsSheet = xlsx.utils.sheet_to_json(workbook.Sheets['Controls ']);
  const dbControlIds = new Set(allControls.map(c => c.controlId));
  const missingControls = controlsSheet.filter(row => !dbControlIds.has(row['Control ID']));
  console.log('3d. Missing controls from XLSX:', missingControls.length);
  if (missingControls.length > 0) console.log(missingControls.map(r => r['Control ID']));

  // 3e. Missing capabilities
  const capabilitiesSheet = xlsx.utils.sheet_to_json(workbook.Sheets['Capabilities ']);
  const dbCapIds = new Set(caps.map(c => c.capabilityId));
  const missingCaps = capabilitiesSheet.filter(row => !dbCapIds.has(row['Capability ID ']));
  console.log('3e. Missing capabilities from XLSX:', missingCaps.length);
  if (missingCaps.length > 0) console.log(missingCaps.map(r => r['Capability ID ']));

  // 3f. Stale counts
  console.log('3f. Checking stale counts...');
  let staleCountIssues = 0;
  const strategies = await Strategy.find({}).lean();
  for (const s of strategies) {
    const actual = await Capability.countDocuments({ strategyId: s.strategyId });
    if (actual !== s.capabilityCount) {
      console.log(`  Strategy ${s.strategyId}: DB says ${s.capabilityCount}, actual=${actual}`);
      staleCountIssues++;
    }
  }
  for (const cap of caps) {
    const actual = await Control.countDocuments({ capabilityId: cap.capabilityId });
    if (actual !== cap.controlCount) {
      console.log(`  Capability ${cap.capabilityId}: DB says ${cap.controlCount}, actual=${actual}`);
      staleCountIssues++;
    }
  }
  if (staleCountIssues === 0) console.log('  No stale counts found.');

  // 3g. Tool mappings
  const toolMapSheet = xlsx.utils.sheet_to_json(workbook.Sheets['ToolControlMap ']);
  const dbMappings = await ControlToolMapping.find({}).lean();
  const dbMappingSet = new Set(dbMappings.map(m => `${m.controlId}_${m.toolId}`));
  let missingMappings = 0;
  for (const row of toolMapSheet) {
    const ctrlId = row['ControlID'];
    const toolId = row['ToolID'];
    if (!dbMappingSet.has(`${ctrlId}_${toolId}`)) {
      missingMappings++;
    }
  }
  console.log('3g. Missing ToolControlMappings:', missingMappings);

  process.exit(0);
}

run().catch(console.error);
