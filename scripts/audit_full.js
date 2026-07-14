/**
 * COMPREHENSIVE AUDIT SCRIPT
 * Compares DB state against MasterSheet.xlsx across all strategies.
 * Outputs a full report of mismatches, gaps, and data corruption.
 * READ-ONLY — makes NO changes to the database.
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose   = require('mongoose');
const xlsx       = require('xlsx');
const path       = require('path');

const Strategy        = require('../models/Strategy');
const Capability      = require('../models/Capability');
const Control         = require('../models/Control');
const Tool            = require('../models/Tool');
const ControlToolMapping = require('../models/ControlToolMapping');

const XLSX_PATH = path.resolve(__dirname, '../../MasterSheet.xlsx');

// ── helpers ───────────────────────────────────────────────────────────────────
function cleanStr(v) { return (v || '').toString().trim(); }

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
  console.log('✅  Connected\n');

  // ── 1. Load MasterSheet ────────────────────────────────────────────────────
  const wb = xlsx.readFile(XLSX_PATH);
  const sheets = {};
  for (const sn of wb.SheetNames) {
    sheets[sn.trim()] = xlsx.utils.sheet_to_json(wb.Sheets[sn]);
  }
  console.log('📄  Sheets available:', wb.SheetNames.map(s => `"${s}"`).join(', '), '\n');

  // Parse each sheet (column names have trailing spaces in some sheets)
  const colKey = (row, ...candidates) => {
    for (const c of candidates) {
      if (row[c] !== undefined) return cleanStr(row[c]);
      if (row[c + ' '] !== undefined) return cleanStr(row[c + ' ']);
      if (row[' ' + c] !== undefined) return cleanStr(row[' ' + c]);
    }
    return '';
  };

  // ── Parse Strategies ─────────────────────────────────────────────────────
  const xlsxStrategies = (sheets['Strategies'] || sheets['strategies'] || []).map(r => ({
    strategyId:   colKey(r, 'Strategy ID', 'StrategyID'),
    strategyName: colKey(r, 'Strategy Name', 'StrategyName'),
  })).filter(s => s.strategyId);

  // ── Parse Capabilities ───────────────────────────────────────────────────
  const xlsxCapabilities = (sheets['Capabilities'] || sheets['Capabilities '] || []).map(r => ({
    capabilityId:          colKey(r, 'Capability ID'),
    capabilityName:        colKey(r, 'Capability Name'),
    capabilityDescription: colKey(r, 'Capability Description'),
    strategyId:            colKey(r, 'Strategy ID'),
  })).filter(c => c.capabilityId);

  // ── Parse Controls ───────────────────────────────────────────────────────
  const xlsxControls = (sheets['Controls'] || sheets['Controls '] || []).map(r => ({
    controlId:          colKey(r, 'Control ID'),
    controlName:        colKey(r, 'Control Name'),
    controlDescription: colKey(r, 'Control Description', 'Description'),
    controlDomain:      colKey(r, 'Control Domain', 'Domain'),
    controlObjective:   colKey(r, 'Control Objective', 'Objective'),
    priority:           colKey(r, 'Priority'),
  })).filter(c => c.controlId);

  // ── Parse CapabilityControlMapping ───────────────────────────────────────
  const xlsxCCM = (sheets['CapabilityControlMapping'] || []).map(r => ({
    capabilityId: colKey(r, 'Capability ID'),
    controlId:    colKey(r, 'Control ID'),
  })).filter(r => r.capabilityId && r.controlId);

  // Build control → capability map (primary: first occurrence)
  const controlToCap = {};
  for (const r of xlsxCCM) {
    if (!controlToCap[r.controlId]) controlToCap[r.controlId] = r.capabilityId;
  }

  // Build capability → strategy map from Capabilities sheet
  const capToStrategy = {};
  for (const c of xlsxCapabilities) {
    capToStrategy[c.capabilityId] = c.strategyId;
  }

  // ── Parse ToolControlMap ─────────────────────────────────────────────────
  const xlsxTCM = (sheets['ToolControlMap'] || sheets['ToolControlMap '] || []).map(r => ({
    controlId: colKey(r, 'Control ID'),
    toolId:    colKey(r, 'Tool ID'),
  })).filter(r => r.controlId && r.toolId);

  // Build control → [toolIds] map
  const controlToTools = {};
  for (const r of xlsxTCM) {
    if (!controlToTools[r.controlId]) controlToTools[r.controlId] = [];
    controlToTools[r.controlId].push(r.toolId);
  }

  // ── 2. Load DB state ──────────────────────────────────────────────────────
  const [dbStrategies, dbCapabilities, dbControls, dbTools, dbCTMs] = await Promise.all([
    Strategy.find().lean(),
    Capability.find().lean(),
    Control.find().lean(),
    Tool.find().lean(),
    ControlToolMapping.find().lean(),
  ]);

  // Deduplicate DB controls by controlId (keep first)
  const dbControlMap  = new Map();
  const dbDuplicates  = [];
  for (const c of dbControls) {
    if (dbControlMap.has(c.controlId)) {
      dbDuplicates.push(c);
    } else {
      dbControlMap.set(c.controlId, c);
    }
  }

  const dbCapMap      = new Map(dbCapabilities.map(c => [c.capabilityId, c]));
  const dbStrategyMap = new Map(dbStrategies.map(s => [s.strategyId, s]));
  const dbToolMap     = new Map(dbTools.map(t => [t.toolId, t]));

  // Build CTM set: "controlId||toolId"
  const dbCTMSet = new Set(dbCTMs.map(m => `${m.controlId}||${m.toolId}`));

  // ── 3. REPORT ─────────────────────────────────────────────────────────────
  const report = {
    missingStrategies:    [],
    missingCapabilities:  [],
    wrongCapStrategyId:   [],
    missingControls:      [],
    wrongControlStrategy: [],
    wrongControlCap:      [],
    wrongControlName:     [],
    missingToolMappings:  [],
    duplicateControls:    [],
    stringNotesControls:  [],
    missingTools:         [],
  };

  // ── 3a. Strategies ────────────────────────────────────────────────────────
  for (const xs of xlsxStrategies) {
    if (!dbStrategyMap.has(xs.strategyId)) {
      report.missingStrategies.push(xs);
    }
  }

  // ── 3b. Capabilities ─────────────────────────────────────────────────────
  for (const xc of xlsxCapabilities) {
    const dbCap = dbCapMap.get(xc.capabilityId);
    if (!dbCap) {
      report.missingCapabilities.push(xc);
    } else if (dbCap.strategyId !== xc.strategyId) {
      report.wrongCapStrategyId.push({
        capabilityId: xc.capabilityId,
        dbStrategyId: dbCap.strategyId,
        xlsxStrategyId: xc.strategyId,
        name: xc.capabilityName,
      });
    }
  }

  // ── 3c. Controls ──────────────────────────────────────────────────────────
  for (const xctrl of xlsxControls) {
    const dbCtrl = dbControlMap.get(xctrl.controlId);
    const expectedCapId = controlToCap[xctrl.controlId];
    const expectedStratId = expectedCapId ? capToStrategy[expectedCapId] : null;

    if (!dbCtrl) {
      report.missingControls.push({
        ...xctrl,
        expectedCapabilityId: expectedCapId || '?',
        expectedStrategyId:   expectedStratId || '?',
      });
      continue;
    }

    // Check strategyId mismatch
    if (expectedStratId && dbCtrl.strategyId !== expectedStratId) {
      report.wrongControlStrategy.push({
        controlId:       xctrl.controlId,
        dbStrategyId:    dbCtrl.strategyId,
        xlsxStrategyId:  expectedStratId,
      });
    }

    // Check capabilityId mismatch
    if (expectedCapId && dbCtrl.capabilityId !== expectedCapId) {
      report.wrongControlCap.push({
        controlId:       xctrl.controlId,
        dbCapabilityId:  dbCtrl.capabilityId,
        xlsxCapabilityId: expectedCapId,
      });
    }

    // Check controlName mismatch
    if (xctrl.controlName && dbCtrl.controlName !== xctrl.controlName) {
      report.wrongControlName.push({
        controlId:   xctrl.controlId,
        dbName:      dbCtrl.controlName,
        xlsxName:    xctrl.controlName,
      });
    }

    // Check for string notes (data corruption)
    if (typeof dbCtrl.notes === 'string') {
      report.stringNotesControls.push({
        controlId: xctrl.controlId,
        notes: dbCtrl.notes,
      });
    }
  }

  // ── 3d. Duplicate controls in DB ─────────────────────────────────────────
  for (const dup of dbDuplicates) {
    report.duplicateControls.push({
      controlId: dup.controlId,
      _id: dup._id,
    });
  }

  // ── 3e. Tool mappings ─────────────────────────────────────────────────────
  for (const [controlId, toolIds] of Object.entries(controlToTools)) {
    for (const toolId of toolIds) {
      const key = `${controlId}||${toolId}`;
      if (!dbCTMSet.has(key)) {
        report.missingToolMappings.push({ controlId, toolId });
      }
    }
  }

  // ── 3f. String notes scan across ALL controls ─────────────────────────────
  const allDbControls = await Control.find({}).lean();
  for (const c of allDbControls) {
    if (typeof c.notes === 'string' && !report.stringNotesControls.find(x => x.controlId === c.controlId)) {
      report.stringNotesControls.push({ controlId: c.controlId, notes: c.notes });
    }
  }

  // ── 3g. Missing tools ─────────────────────────────────────────────────────
  const allXlsxToolIds = [...new Set(xlsxTCM.map(r => r.toolId))];
  for (const toolId of allXlsxToolIds) {
    if (!dbToolMap.has(toolId)) {
      report.missingTools.push(toolId);
    }
  }

  // ── 4. Print report ───────────────────────────────────────────────────────
  console.log('═'.repeat(70));
  console.log('FULL AUDIT REPORT');
  console.log('═'.repeat(70));

  const section = (title, items, formatter) => {
    console.log(`\n▶ ${title} (${items.length})`);
    if (items.length === 0) {
      console.log('  ✅  None — all OK');
    } else {
      items.forEach(item => console.log('  ' + formatter(item)));
    }
  };

  section('Missing Strategies',    report.missingStrategies,
    s => `❌ ${s.strategyId} "${s.strategyName}"`);

  section('Missing Capabilities',   report.missingCapabilities,
    c => `❌ ${c.capabilityId} [${c.strategyId}] "${c.capabilityName}"`);

  section('Capabilities with wrong strategyId', report.wrongCapStrategyId,
    c => `❌ ${c.capabilityId} DB=${c.dbStrategyId} XLSX=${c.xlsxStrategyId} "${c.name}"`);

  section('Missing Controls (in XLSX but not DB)', report.missingControls,
    c => `❌ ${c.controlId} cap=${c.expectedCapabilityId} strat=${c.expectedStrategyId} "${c.controlName}"`);

  section('Controls with wrong strategyId', report.wrongControlStrategy,
    c => `❌ ${c.controlId} DB=${c.dbStrategyId} XLSX=${c.xlsxStrategyId}`);

  section('Controls with wrong capabilityId', report.wrongControlCap,
    c => `❌ ${c.controlId} DB=${c.dbCapabilityId} XLSX=${c.xlsxCapabilityId}`);

  section('Controls with wrong name', report.wrongControlName,
    c => `❌ ${c.controlId} DB="${c.dbName}" XLSX="${c.xlsxName}"`);

  section('Duplicate control documents', report.duplicateControls,
    c => `❌ ${c.controlId} extra _id=${c._id}`);

  section('Controls with string notes (corruption)', report.stringNotesControls,
    c => `❌ ${c.controlId} notes="${c.notes}"`);

  section('Missing ControlToolMappings', report.missingToolMappings,
    m => `❌ ${m.controlId} ↔ ${m.toolId}`);

  section('Tool IDs in XLSX but missing from DB', report.missingTools,
    t => `❌ toolId="${t}"`);

  // ── 5. Summary counts ─────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('SUMMARY');
  console.log('═'.repeat(70));
  const total = Object.values(report).reduce((sum, arr) => sum + arr.length, 0);
  for (const [key, arr] of Object.entries(report)) {
    if (arr.length > 0) console.log(`  ${arr.length.toString().padStart(4)}  ${key}`);
  }
  console.log(`\n  TOTAL issues: ${total}`);
  console.log('═'.repeat(70) + '\n');

  // Save report as JSON for use in patch scripts
  const fs = require('fs');
  const outPath = path.resolve(__dirname, '_audit_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n💾  Report saved to: ${outPath}\n`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async err => {
  console.error('❌  Fatal:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
