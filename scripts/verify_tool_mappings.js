/**
 * VERIFICATION SCRIPT
 * Independently verifies the ControlToolMapping situation:
 * 1. Prints the EXACT column keys from the ToolControlMap sheet
 * 2. Counts all ControlToolMapping records in DB
 * 3. Parses ALL control→tool pairs from the sheet (using correct keys)
 * 4. Compares against DB — shows missing AND extra mappings
 * 5. Checks if linkedTools on Control docs are also populated
 *
 * READ-ONLY — makes NO changes.
 */
'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const xlsx     = require('xlsx');
const path     = require('path');
const ControlToolMapping = require('../models/ControlToolMapping');
const Control            = require('../models/Control');
const Tool               = require('../models/Tool');

const XLSX_PATH = path.resolve(__dirname, '../../MasterSheet.xlsx');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  console.log('✅ Connected\n');

  const wb = xlsx.readFile(XLSX_PATH);

  // ── 1. Find the ToolControlMap sheet (name may have trailing spaces) ───────
  const tcmSheetName = wb.SheetNames.find(n => n.trim() === 'ToolControlMap');
  console.log(`Sheet names: ${wb.SheetNames.map(n => `"${n}"`).join(', ')}`);
  console.log(`\nUsing sheet: "${tcmSheetName}"\n`);

  const tcmSheet = wb.Sheets[tcmSheetName];
  const tcmRows  = xlsx.utils.sheet_to_json(tcmSheet);

  // ── 2. Print ACTUAL column keys (first row) ───────────────────────────────
  const firstRow = tcmRows[0] || {};
  console.log('=== ACTUAL COLUMN KEYS in ToolControlMap sheet ===');
  for (const key of Object.keys(firstRow)) {
    console.log(`  "${key}"  → sample value: "${firstRow[key]}"`);
  }
  console.log(`\nTotal rows in sheet: ${tcmRows.length}`);

  // ── 3. Parse all pairs using EVERY possible key variant ───────────────────
  const possibleCtrlKeys = ['Control ID', 'Control ID ', 'ControlID', 'control_id', 'CONTROL ID'];
  const possibleToolKeys = ['Tool ID', 'Tool ID ', 'ToolID', 'tool_id', 'TOOL ID'];

  const findKey = (row, candidates) => {
    for (const k of candidates) {
      if (row[k] !== undefined) return (row[k] || '').toString().trim();
    }
    // fallback: try all keys
    const keys = Object.keys(row);
    for (const k of keys) {
      const lower = k.toLowerCase().replace(/\s/g,'');
      if (lower === 'controlid' || lower === 'control_id') return (row[k] || '').toString().trim();
      if (lower === 'toolid'    || lower === 'tool_id')    return (row[k] || '').toString().trim();
    }
    return '';
  };

  const xlsxPairs = new Set();
  for (const row of tcmRows) {
    let ctrlId = '';
    let toolId = '';
    for (const k of Object.keys(row)) {
      const kl = k.toLowerCase().replace(/\s+/g, '');
      if (kl === 'controlid') ctrlId = (row[k] || '').toString().trim();
      if (kl === 'toolid')    toolId = (row[k] || '').toString().trim();
    }
    if (ctrlId && toolId) xlsxPairs.add(`${ctrlId}||${toolId}`);
  }

  console.log(`\nUnique control↔tool pairs parsed from XLSX: ${xlsxPairs.size}`);

  // ── 4. Load DB ControlToolMappings ────────────────────────────────────────
  const dbMappings = await ControlToolMapping.find({}).lean();
  const dbPairs    = new Set(dbMappings.map(m => `${m.controlId}||${m.toolId}`));
  console.log(`ControlToolMapping docs in DB: ${dbMappings.length}`);

  // ── 5. Compare ─────────────────────────────────────────────────────────────
  const missingFromDB = [...xlsxPairs].filter(p => !dbPairs.has(p));
  const extraInDB     = [...dbPairs].filter(p => !xlsxPairs.has(p));

  console.log(`\n=== Missing from DB (in XLSX but not in ControlToolMapping collection) ===`);
  if (missingFromDB.length === 0) {
    console.log('  ✅ NONE — all XLSX mappings exist in DB');
  } else {
    for (const p of missingFromDB.sort()) console.log(`  ❌ ${p.replace('||', ' ↔ ')}`);
  }

  console.log(`\nTotal missing from DB: ${missingFromDB.length}`);

  console.log(`\n=== Extra in DB (not in XLSX — possibly legacy) ===`);
  if (extraInDB.length === 0) {
    console.log('  ✅ NONE');
  } else {
    for (const p of extraInDB.slice(0, 20).sort()) console.log(`  ℹ️  ${p.replace('||', ' ↔ ')}`);
    if (extraInDB.length > 20) console.log(`  ... and ${extraInDB.length - 20} more`);
  }

  console.log(`\nTotal extra in DB: ${extraInDB.length}`);

  // ── 6. Check linkedTools population on Controls ────────────────────────────
  console.log('\n=== linkedTools population check on Control documents ===');
  const allTools   = await Tool.find({}).lean();
  const toolIdMap  = new Map(allTools.map(t => [t.toolId, t._id]));

  // For each XLSX control→tool pair, check if Control.linkedTools includes the tool ObjectId
  const ctrlsNeedingLinkedToolsUpdate = new Set();
  for (const pair of xlsxPairs) {
    const [controlId, toolId] = pair.split('||');
    const toolObjId = toolIdMap.get(toolId);
    if (!toolObjId) continue; // tool not in DB
    const ctrl = await Control.findOne({ controlId }).select('linkedTools').lean();
    if (!ctrl) continue;
    const alreadyLinked = (ctrl.linkedTools || []).some(id => id.toString() === toolObjId.toString());
    if (!alreadyLinked) ctrlsNeedingLinkedToolsUpdate.add(controlId);
  }

  console.log(`Controls missing linkedTools entries: ${ctrlsNeedingLinkedToolsUpdate.size}`);
  if (ctrlsNeedingLinkedToolsUpdate.size > 0) {
    console.log('  Controls affected:', [...ctrlsNeedingLinkedToolsUpdate].sort().join(', '));
  } else {
    console.log('  ✅ All Control.linkedTools are correctly populated');
  }

  // ── 7. Verify the 64 that the other agent claims to have inserted ──────────
  console.log('\n=== VERDICT ===');
  if (missingFromDB.length === 0) {
    console.log('✅ CONFIRMED: All XLSX ControlToolMappings are present in the DB.');
    console.log('   The other agent\'s fix appears to have been applied correctly.');
  } else {
    console.log(`❌ PROBLEM: ${missingFromDB.length} XLSX mappings are STILL missing from DB.`);
    console.log('   The other agent\'s fix may not have been applied correctly, or may have used wrong keys.');
  }

  console.log(`\n   DB total: ${dbMappings.length} mappings`);
  console.log(`   XLSX total: ${xlsxPairs.size} pairs`);
  console.log(`   Missing: ${missingFromDB.length}`);
  console.log(`   Extra: ${extraInDB.length}`);

  await mongoose.disconnect();
}

main().catch(console.error);
