/**
 * Pre-fix investigation:
 * - List all strategies with their IDs in DB
 * - Check CAP-105..127 to understand TD strategy structure  
 * - Check what MT controls SHOULD belong to (what does "SA" strategy name say?)
 * - Look at controls in TD strategy currently to understand SD context
 */
'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose   = require('mongoose');
const xlsx       = require('xlsx');
const path       = require('path');
const Strategy   = require('../models/Strategy');
const Capability = require('../models/Capability');
const Control    = require('../models/Control');

const XLSX_PATH = path.resolve(__dirname, '../../MasterSheet.xlsx');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
  console.log('✅ Connected\n');

  // 1. All strategies in DB
  const strategies = await Strategy.find().select('strategyId strategyName').sort({ strategyId: 1 }).lean();
  console.log('=== DB Strategies ===');
  for (const s of strategies) console.log(`  ${s.strategyId.padEnd(6)} "${s.strategyName}"`);

  // 2. XLSX Strategies
  const wb = xlsx.readFile(XLSX_PATH);
  const xlsxStrats = xlsx.utils.sheet_to_json(wb.Sheets['Strategies']);
  console.log('\n=== XLSX Strategies ===');
  for (const s of xlsxStrats) {
    const id   = (s['Strategy ID'] || '').trim();
    const name = (s['Strategy Name'] || s['Strategy Name '] || '').trim();
    console.log(`  ${id.padEnd(6)} "${name}"`);
  }

  // 3. Capabilities for TD strategy (to understand what CAP-116..127 are)
  const caps = xlsx.utils.sheet_to_json(wb.Sheets['Capabilities ']);
  const tdCaps = caps.filter(r => (r['Strategy ID'] || '').trim() === 'TD');
  console.log('\n=== XLSX Capabilities for TD strategy ===');
  for (const c of tdCaps) {
    const id   = (c['Capability ID '] || '').trim();
    const name = (c['Capability Name '] || '').trim();
    console.log(`  ${id.padEnd(10)} "${name}"`);
  }

  // 4. DB controls for strategy "TD" 
  const tdControls = await Control.find({ strategyId: 'TD' }).select('controlId controlName capabilityId').sort({ controlId: 1 }).lean();
  console.log('\n=== DB Controls with strategyId=TD ===');
  for (const c of tdControls) console.log(`  ${c.controlId.padEnd(8)} cap=${c.capabilityId.padEnd(10)} "${c.controlName}"`);

  // 5. DB controls for strategy "SA" and "MO"
  for (const sid of ['SA', 'MO']) {
    const ctrls = await Control.find({ strategyId: sid }).select('controlId controlName capabilityId').sort({ controlId: 1 }).lean();
    console.log(`\n=== DB Controls with strategyId=${sid} (${ctrls.length}) ===`);
    for (const c of ctrls) console.log(`  ${c.controlId.padEnd(8)} cap=${c.capabilityId.padEnd(10)} "${c.controlName}"`);
  }

  // 6. XLSX: What does the Controls sheet say for MT and SD?
  const xlsxControls = xlsx.utils.sheet_to_json(wb.Sheets['Controls ']);
  const ccm = xlsx.utils.sheet_to_json(wb.Sheets['CapabilityControlMapping']);
  const xlsxCaps = xlsx.utils.sheet_to_json(wb.Sheets['Capabilities ']);
  
  // Build cap → strategy map
  const capToStrat = {};
  for (const c of xlsxCaps) {
    const capId = (c['Capability ID '] || '').trim();
    const stratId = (c['Strategy ID'] || '').trim();
    capToStrat[capId] = stratId;
  }

  // Build controlId → capId map (first occurrence)
  const ctrlToCap = {};
  for (const r of ccm) {
    const ctrlId = (r['Control ID '] || '').trim();
    const capId  = (r['Capability ID'] || '').trim();
    if (ctrlId && capId && !ctrlToCap[ctrlId]) ctrlToCap[ctrlId] = capId;
  }

  // Print MT and SD controls per XLSX
  const prefixes = ['MT-0', 'MT-1', 'SD-0'];
  const interestingXlsx = xlsxControls.filter(r => {
    const id = (r['Control ID '] || r['Control ID'] || '').trim();
    return prefixes.some(p => id.startsWith(p));
  });
  console.log('\n=== XLSX MT/SD controls with their XLSX-derived strategyId ===');
  for (const r of interestingXlsx) {
    const id     = (r['Control ID '] || r['Control ID'] || '').trim();
    const name   = (r['Control Name '] || r['Control Name'] || '').trim();
    const capId  = ctrlToCap[id] || '?';
    const stratId = capToStrat[capId] || '?';
    console.log(`  ${id.padEnd(8)} → cap=${capId.padEnd(10)} strat=${stratId}  "${name}"`);
  }

  // 7. What is the "RAG" vs "RG" situation?
  const ragDbCaps = await Capability.find({ capabilityId: { $in: ['CAP-032','CAP-033'] } }).lean();
  console.log('\n=== CAP-032/033 in DB ===');
  for (const c of ragDbCaps) console.log(`  ${c.capabilityId} strategyId=${c.strategyId} "${c.capabilityName}"`);

  const ragStrategy = await Strategy.findOne({ strategyId: 'RAG' }).lean();
  const rgStrategy  = await Strategy.findOne({ strategyId: 'RG' }).lean();
  console.log('\n=== RAG vs RG in DB ===');
  console.log('  RAG:', ragStrategy ? `"${ragStrategy.strategyName}"` : 'NOT FOUND');
  console.log('  RG:',  rgStrategy  ? `"${rgStrategy.strategyName}"` : 'NOT FOUND');

  await mongoose.disconnect();
}

main().catch(console.error);
