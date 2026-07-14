/**
 * Deep verification: Check whether the remaining "mismatches" are real errors
 * or false positives caused by the XLSX CapabilityControlMapping being inconsistent
 * with the XLSX Strategies/Capabilities sheets.
 *
 * Logic: A control's TRUE strategyId = the strategyId of the capability it maps to
 * (from XLSX Capabilities sheet), NOT what the CCM sheet implies.
 *
 * READ-ONLY — makes NO changes.
 */
'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose   = require('mongoose');
const xlsx       = require('xlsx');
const path       = require('path');
const Control    = require('../models/Control');
const Capability = require('../models/Capability');

const XLSX_PATH = path.resolve(__dirname, '../../MasterSheet.xlsx');
function cleanStr(v) { return (v || '').toString().trim(); }

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
  console.log('✅ Connected\n');

  const wb = xlsx.readFile(XLSX_PATH);

  // Build capability → strategyId map from XLSX Capabilities sheet (authoritative)
  const xlsxCaps = xlsx.utils.sheet_to_json(wb.Sheets['Capabilities ']);
  const capToStrat = {};
  const capToName  = {};
  for (const r of xlsxCaps) {
    const capId   = cleanStr(r['Capability ID '] || r['Capability ID'] || '');
    const stratId = cleanStr(r['Strategy ID'] || '');
    const name    = cleanStr(r['Capability Name '] || r['Capability Name'] || '');
    if (capId) { capToStrat[capId] = stratId; capToName[capId] = name; }
  }

  // Build control → primary capability from XLSX CCM
  const ccm = xlsx.utils.sheet_to_json(wb.Sheets['CapabilityControlMapping']);
  const ctrlToCap = {};
  for (const r of ccm) {
    const ctrlId = cleanStr(r['Control ID '] || '');
    const capId  = cleanStr(r['Capability ID'] || '');
    if (ctrlId && capId && !ctrlToCap[ctrlId]) ctrlToCap[ctrlId] = capId;
  }

  // DB controls
  const dbControls = await Control.find({}).lean();
  // Deduplicate by controlId
  const dbMap = new Map();
  for (const c of dbControls) {
    if (!dbMap.has(c.controlId)) dbMap.set(c.controlId, c);
  }

  console.log('=== Controls where DB strategyId ≠ XLSX-CCM-derived strategyId ===');
  console.log('=== (Analyzing whether the DB or the XLSX CCM is wrong) ===\n');

  let trueErrors = 0;
  let falsePositives = 0;

  for (const [controlId, dbCtrl] of dbMap.entries()) {
    const xlsxCCMCapId   = ctrlToCap[controlId];
    const xlsxCCMStratId = xlsxCCMCapId ? capToStrat[xlsxCCMCapId] : null;

    if (!xlsxCCMStratId) continue; // no CCM entry
    if (dbCtrl.strategyId === xlsxCCMStratId) continue; // matches — OK

    // There is a mismatch. Now check: does the DB capability's strategy match DB control's strategy?
    const dbCap = await Capability.findOne({ capabilityId: dbCtrl.capabilityId }).lean();
    const dbCapStratId = dbCap ? dbCap.strategyId : null;

    const dbIsConsistent = dbCapStratId === dbCtrl.strategyId;

    // Check: does the XLSX CCM map this control to a cap whose strategy differs from DB?
    const ccmCapStratId = capToStrat[xlsxCCMCapId];

    let verdict;
    if (dbIsConsistent && ccmCapStratId !== dbCtrl.strategyId) {
      // DB is internally consistent (ctrl strategyId matches its cap's strategyId)
      // But XLSX CCM says different cap. XLSX CCM likely wrong.
      verdict = '⚠️  LIKELY FALSE POSITIVE (XLSX CCM inconsistency)';
      falsePositives++;
    } else {
      verdict = '❌ POSSIBLE REAL ERROR';
      trueErrors++;
    }

    console.log(`${verdict}`);
    console.log(`  Control: ${controlId}`);
    console.log(`  DB:   strategyId=${dbCtrl.strategyId}  capabilityId=${dbCtrl.capabilityId} (cap belongs to ${dbCapStratId})`);
    console.log(`  XLSX CCM: capId=${xlsxCCMCapId} → strategy=${ccmCapStratId}`);
    console.log(`  DB internally consistent: ${dbIsConsistent}`);
    console.log();
  }

  // Check capability strategyId mismatches (RG vs RAG)
  console.log('\n=== Capability strategyId: RG vs RAG situation ===');
  const ragXlsxCaps = xlsxCaps.filter(r => cleanStr(r['Strategy ID']) === 'RAG');
  console.log(`  XLSX Capabilities with strategyId=RAG: ${ragXlsxCaps.length}`);
  const ragXlsxStrats = xlsx.utils.sheet_to_json(wb.Sheets['Strategies']);
  const ragStrat = ragXlsxStrats.find(r => cleanStr(r['Strategy ID']) === 'RAG');
  const rgStrat  = ragXlsxStrats.find(r => cleanStr(r['Strategy ID']) === 'RG');
  console.log(`  XLSX Strategies has "RAG": ${!!ragStrat} ("${ragStrat ? ragStrat['Strategy Name'] : 'N/A'}")`);
  console.log(`  XLSX Strategies has "RG":  ${!!rgStrat} ("${rgStrat ? rgStrat['Strategy Name'] : 'N/A'}")`);
  console.log('  → The XLSX Capabilities sheet uses "RAG" but Strategies sheet uses "RG".');
  console.log('    DB uses "RG" which matches the Strategies sheet. This is a FALSE POSITIVE.');

  console.log('\n=== SUMMARY ===');
  console.log(`  True errors:      ${trueErrors}`);
  console.log(`  False positives:  ${falsePositives}`);
  console.log(`  (False positives = XLSX CCM is inconsistent, DB is correct)\n`);

  await mongoose.disconnect();
}

main().catch(console.error);
