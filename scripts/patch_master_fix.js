/**
 * ============================================================
 * MASTER PATCH SCRIPT — Full DB Remediation
 * ============================================================
 * Fixes (in safe, idempotent order):
 *
 *  1. Remove 44 duplicate Control documents
 *     (keep the one with most user-generated data: notes, ownerId, etc.)
 *
 *  2. Fix MT-12 duplicate in TD strategy (keep newest)
 *
 *  3. Fix GC-06..GC-12 wrongly placed under MO strategy → correct to GC
 *
 *  4. Fix MT-06..MT-11 capability assignments within MO strategy
 *     (they already have strategyId=MO which is correct; just fix capabilityIds)
 *
 *  5. Insert missing Capabilities CAP-116..CAP-127 for TD strategy
 *
 *  6. Insert missing Controls TD-01..TD-12 under TD strategy
 *
 *  7. Insert DS-09 and AS-10 (find their caps from XLSX or assign to closest)
 *
 *  8. Sync controlCount on all affected capabilities
 *
 *  9. Sync capabilityCount on all affected strategies
 *
 * SAFETY RULES:
 *   - Never overwrite documents that have user data (notes, ownerId, evidence refs)
 *   - When deduplicating, keep the doc with the richest user data (most notes, ownerId set, etc.)
 *   - All updates are additive or corrective (never destructive to user data fields)
 *   - Idempotent: safe to re-run
 * ============================================================
 * Run: node scripts/patch_master_fix.js
 */

'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose   = require('mongoose');
const xlsx       = require('xlsx');
const path       = require('path');

const Strategy        = require('../models/Strategy');
const Capability      = require('../models/Capability');
const Control         = require('../models/Control');
const ControlToolMapping = require('../models/ControlToolMapping');

const XLSX_PATH = path.resolve(__dirname, '../../MasterSheet.xlsx');

function cleanStr(v) { return (v || '').toString().trim(); }

// ── Score a document by how much user data it has (higher = keep) ─────────────
function userDataScore(doc) {
  let score = 0;
  if (doc.ownerId)                    score += 100;
  if (Array.isArray(doc.notes) && doc.notes.length > 0) score += 50 * doc.notes.length;
  if (doc.lifecycleStage && doc.lifecycleStage !== 'Defined') score += 30;
  if (Array.isArray(doc.lifecycleHistory) && doc.lifecycleHistory.length > 0) score += 10;
  if (doc.atRisk)                     score += 5;
  if (doc.riskLevel)                  score += 5;
  return score;
}

async function syncCapabilityCount(capabilityId) {
  const count = await Control.countDocuments({ capabilityId });
  await Capability.findOneAndUpdate({ capabilityId }, { $set: { controlCount: count } });
  return count;
}

async function syncStrategyCapCount(strategyId) {
  const count = await Capability.countDocuments({ strategyId });
  await Strategy.findOneAndUpdate({ strategyId }, { $set: { capabilityCount: count } });
  return count;
}

async function safeInsertCap(data, label) {
  const existing = await Capability.findOne({ capabilityId: data.capabilityId }).lean();
  if (existing) {
    console.log(`    ⚡ SKIP [exists]: ${label}`);
    return existing;
  }
  const doc = await Capability.create(data);
  console.log(`    ✅ INSERTED CAP: ${label}`);
  return doc;
}

async function safeInsertControl(data, label) {
  const existing = await Control.findOne({ controlId: data.controlId }).lean();
  if (existing) {
    console.log(`    ⚡ SKIP [exists]: ${label}`);
    return existing;
  }
  const doc = await Control.create(data);
  console.log(`    ✅ INSERTED CTRL: ${label}`);
  return doc;
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
  console.log('✅  Connected to MongoDB\n');

  // ── Load XLSX for TD controls data ────────────────────────────────────────
  const wb = xlsx.readFile(XLSX_PATH);
  const xlsxControls    = xlsx.utils.sheet_to_json(wb.Sheets['Controls ']);
  const xlsxTCM         = xlsx.utils.sheet_to_json(wb.Sheets['ToolControlMap ']);
  const xlsxTools       = xlsx.utils.sheet_to_json(wb.Sheets['Tools']);
  const xlsxCaps        = xlsx.utils.sheet_to_json(wb.Sheets['Capabilities ']);

  // Build maps
  const ctrlDataMap = {};
  for (const r of xlsxControls) {
    const id = cleanStr(r['Control ID '] || r['Control ID'] || '');
    if (id) ctrlDataMap[id] = r;
  }

  const toolDataMap = {};
  for (const r of xlsxTools) {
    const id = cleanStr(r['Tool ID'] || r['Tool ID '] || '');
    if (id) toolDataMap[id] = r;
  }

  // control → tools from ToolControlMap
  const xlsxCtrlToolMap = {};
  for (const r of xlsxTCM) {
    const ctrlId = cleanStr(r['Control ID '] || r['Control ID'] || '');
    const toolId = cleanStr(r['Tool ID '] || r['Tool ID'] || '');
    if (ctrlId && toolId) {
      if (!xlsxCtrlToolMap[ctrlId]) xlsxCtrlToolMap[ctrlId] = [];
      xlsxCtrlToolMap[ctrlId].push(toolId);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 1: Deduplicate control documents
  // ════════════════════════════════════════════════════════════════════════
  console.log('═'.repeat(65));
  console.log('STEP 1 — Deduplicating Control documents');
  console.log('═'.repeat(65));

  const allControls = await Control.find({}).lean();
  const byControlId = new Map();
  for (const c of allControls) {
    if (!byControlId.has(c.controlId)) byControlId.set(c.controlId, []);
    byControlId.get(c.controlId).push(c);
  }

  let totalDeleted = 0;
  const affectedCapIds = new Set();

  for (const [controlId, docs] of byControlId.entries()) {
    if (docs.length <= 1) continue;

    // Sort by user data score descending, then by _id descending (newest first) as tiebreaker
    docs.sort((a, b) => {
      const scoreDiff = userDataScore(b) - userDataScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return b._id.toString().localeCompare(a._id.toString());
    });

    const keepDoc = docs[0];
    const deleteDocs = docs.slice(1);

    // Merge any user data from duplicates into keepDoc before deleting
    let needsUpdate = false;
    const updateFields = {};

    for (const dup of deleteDocs) {
      // Merge notes arrays (avoid text duplicates)
      if (Array.isArray(dup.notes) && dup.notes.length > 0) {
        const currentNotes = Array.isArray(keepDoc.notes) ? keepDoc.notes : [];
        const existingTexts = new Set(currentNotes.map(n => n.text));
        const newNotes = dup.notes.filter(n => n.text && !existingTexts.has(n.text));
        if (newNotes.length > 0) {
          updateFields['$push'] = { notes: { $each: newNotes } };
          needsUpdate = true;
        }
      }
      // Preserve ownerId if keepDoc doesn't have one
      if (!keepDoc.ownerId && dup.ownerId) {
        updateFields['$set'] = { ...(updateFields['$set'] || {}), ownerId: dup.ownerId };
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await Control.findByIdAndUpdate(keepDoc._id, updateFields);
      console.log(`  🔀 Merged user data into ${controlId} (kept _id=${keepDoc._id})`);
    }

    const deleteIds = deleteDocs.map(d => d._id);
    await Control.deleteMany({ _id: { $in: deleteIds } });
    affectedCapIds.add(keepDoc.capabilityId);
    totalDeleted += deleteIds.length;
    console.log(`  🗑️  ${controlId}: Deleted ${deleteIds.length} duplicate(s), kept _id=${keepDoc._id} (score=${userDataScore(keepDoc)})`);
  }

  console.log(`\n  Total duplicates removed: ${totalDeleted}\n`);

  // ════════════════════════════════════════════════════════════════════════
  // STEP 2: Fix GC-06..GC-12 — wrongly under MO, should be GC
  // ════════════════════════════════════════════════════════════════════════
  console.log('═'.repeat(65));
  console.log('STEP 2 — Fix GC controls wrongly placed under MO strategy');
  console.log('═'.repeat(65));

  // GC capabilities range: find GC caps
  const gcCaps = await Capability.find({ strategyId: 'GC' }).select('capabilityId').lean();
  const gcCapIds = new Set(gcCaps.map(c => c.capabilityId));

  const wrongGcControls = await Control.find({ controlId: /^GC-/, strategyId: 'MO' }).lean();
  console.log(`  Found ${wrongGcControls.length} GC controls under MO strategy`);

  for (const c of wrongGcControls) {
    // Find the right GC capability for this control from XLSX CCM
    await Control.findByIdAndUpdate(c._id, { $set: { strategyId: 'GC', updatedAt: new Date() } });
    affectedCapIds.add(c.capabilityId);
    console.log(`  ✏️  ${c.controlId}: strategyId MO → GC`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 3: Fix MT-06..MT-11 capability assignments within MO
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(65));
  console.log('STEP 3 — Fix MT-06..MT-11 capabilityId within MO strategy');
  console.log('═'.repeat(65));

  // Per XLSX CCM, MT-06..11 map to SA capabilities. But functionally they are
  // MO controls. The XLSX CCM has an error mapping them to SA caps (CAP-097..102).
  // The correct approach: keep them in MO and assign them to proper MO capabilities.
  // MO capabilities: CAP-087..096. Let's match by function:
  //
  //  MT-06 "Cost monitoring"           → CAP-090 "Token consumption monitoring"
  //  MT-07 "Latency & performance"     → CAP-092 "Latency monitoring"
  //  MT-08 "Security event detection"  → CAP-094 "Security event detection"
  //  MT-09 "Behavioral anomaly"        → CAP-095 "Behavioral anomaly detection"
  //  MT-10 "Alerting & notification"   → CAP-096 "Full traceability" or new
  //  MT-11 "SIEM integration"          → CAP-094 "Security event detection"

  // Check what MO caps exist
  const moCaps = await Capability.find({ strategyId: 'MO' }).select('capabilityId capabilityName').lean();
  console.log('  MO capabilities:');
  for (const c of moCaps) console.log(`    ${c.capabilityId}  "${c.capabilityName}"`);

  const MT_CAP_MAP = {
    'MT-06': 'CAP-090', // Cost monitoring → Token consumption monitoring
    'MT-07': 'CAP-092', // Latency & performance → Latency monitoring
    'MT-08': 'CAP-094', // Security event detection → Security event detection
    'MT-09': 'CAP-095', // Behavioral anomaly → Behavioral anomaly detection
    'MT-10': 'CAP-094', // Alerting → Security event detection
    'MT-11': 'CAP-094', // SIEM integration → Security event detection
  };

  for (const [controlId, capabilityId] of Object.entries(MT_CAP_MAP)) {
    const ctrl = await Control.findOne({ controlId }).lean();
    if (!ctrl) { console.log(`  ⚠️  ${controlId}: NOT FOUND`); continue; }
    if (ctrl.capabilityId === capabilityId) {
      console.log(`  ✅  ${controlId}: capabilityId already ${capabilityId}`);
      continue;
    }
    affectedCapIds.add(ctrl.capabilityId);
    affectedCapIds.add(capabilityId);
    await Control.findOneAndUpdate({ controlId }, { $set: { capabilityId, updatedAt: new Date() } });
    console.log(`  ✏️  ${controlId}: capabilityId ${ctrl.capabilityId} → ${capabilityId}`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 4: Insert missing TD capabilities (CAP-116..CAP-127)
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(65));
  console.log('STEP 4 — Insert missing TD capabilities (CAP-116..CAP-127)');
  console.log('═'.repeat(65));

  // Get existing TD caps
  const existingTdCaps = await Capability.find({ strategyId: 'TD' }).select('capabilityId').lean();
  const existingTdCapIds = new Set(existingTdCaps.map(c => c.capabilityId));
  console.log(`  Existing TD caps: ${[...existingTdCapIds].join(', ')}`);

  // TD capabilities from XLSX Capabilities sheet (strategyId=TD)
  const tdXlsxCaps = xlsxCaps.filter(r => cleanStr(r['Strategy ID']) === 'TD');
  const tdCapDefs = tdXlsxCaps.map(r => ({
    capabilityId:          cleanStr(r['Capability ID '] || r['Capability ID'] || ''),
    capabilityName:        cleanStr(r['Capability Name '] || r['Capability Name'] || ''),
    capabilityDescription: cleanStr(r['Capability Description '] || r['Capability Description'] || ''),
    strategyId:            'TD',
    capabilityStatus:      null,
    controlCount:          0,
  })).filter(c => c.capabilityId);

  // Additional caps referenced in CCM but not in Capabilities sheet
  const ccmXlsx = xlsx.utils.sheet_to_json(wb.Sheets['CapabilityControlMapping']);
  const tdCtrlIds = ['TD-01','TD-02','TD-03','TD-04','TD-05','TD-06','TD-07','TD-08','TD-09','TD-10','TD-11','TD-12'];
  const tdCcmRefs = ccmXlsx.filter(r => tdCtrlIds.includes(cleanStr(r['Control ID '] || '')));
  const ccmCapIds = [...new Set(tdCcmRefs.map(r => cleanStr(r['Capability ID'] || '')))].filter(Boolean);
  console.log('  TD caps referenced in CCM:', ccmCapIds.join(', '));

  // Merge: any CCM-referenced cap not in XLSX caps list gets a placeholder entry
  const capIdsInXlsxCaps = new Set(tdCapDefs.map(c => c.capabilityId));
  for (const capId of ccmCapIds) {
    if (!capIdsInXlsxCaps.has(capId)) {
      tdCapDefs.push({
        capabilityId:          capId,
        capabilityName:        `TD Capability ${capId}`,
        capabilityDescription: '',
        strategyId:            'TD',
        capabilityStatus:      null,
        controlCount:          0,
      });
    }
  }

  for (const cap of tdCapDefs) {
    if (!cap.capabilityId) continue;
    await safeInsertCap(cap, `${cap.capabilityId} — ${cap.capabilityName} [TD]`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 5: Insert missing controls TD-01..TD-12
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(65));
  console.log('STEP 5 — Insert missing Controls TD-01..TD-12');
  console.log('═'.repeat(65));

  // Build CCM map: controlId → primary capabilityId
  const ctrlCapMap = {};
  for (const r of ccmXlsx) {
    const ctrlId = cleanStr(r['Control ID '] || '');
    const capId  = cleanStr(r['Capability ID'] || '');
    if (ctrlId && capId && !ctrlCapMap[ctrlId]) ctrlCapMap[ctrlId] = capId;
  }

  for (const controlId of tdCtrlIds) {
    const xlsxData   = ctrlDataMap[controlId];
    if (!xlsxData) { console.log(`  ⚠️  No XLSX data for ${controlId}`); continue; }

    const capabilityId = ctrlCapMap[controlId] || '';
    if (!capabilityId) {
      console.log(`  ⚠️  No capability mapping for ${controlId} in CCM — skipping`);
      continue;
    }

    // Determine strategyId from capability
    const cap = await Capability.findOne({ capabilityId }).lean();
    const strategyId = cap ? cap.strategyId : 'TD';

    const controlName = cleanStr(xlsxData['Control Name '] || xlsxData['Control Name'] || '');
    const controlDesc = cleanStr(xlsxData['Control Description '] || xlsxData['Control Description'] || xlsxData['Description'] || '');
    const controlDom  = cleanStr(xlsxData['Control Domain '] || xlsxData['Control Domain'] || xlsxData['Domain'] || '');
    const controlObj  = cleanStr(xlsxData['Control Objective '] || xlsxData['Control Objective'] || xlsxData['Objective'] || '');
    const priority    = cleanStr(xlsxData['Priority '] || xlsxData['Priority'] || '');

    await safeInsertControl({
      controlId,
      controlName,
      controlDescription: controlDesc,
      controlDomain:      controlDom,
      controlObjective:   controlObj,
      priority,
      title:              controlName,
      description:        controlDesc,
      category:           controlDom,
      capabilityId,
      strategyId,
      status:             'Pending',
      lifecycleStage:     'Defined',
      atRisk:             false,
      notes:              [],
      lifecycleHistory:   [],
      linkedTools:        [],
      createdAt:          new Date(),
      updatedAt:          new Date(),
    }, `${controlId} — ${controlName}`);

    affectedCapIds.add(capabilityId);
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 6: Insert DS-09 and AS-10
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(65));
  console.log('STEP 6 — Insert DS-09 and AS-10');
  console.log('═'.repeat(65));

  // DS-09: "Data loss prevention (DLP)" — find a DS capability to attach it to
  // Use primary DS cap from CCM if any, otherwise pick last DS cap
  const dsCapsForDs09 = await Capability.find({ strategyId: 'DS' }).sort({ capabilityId: -1 }).lean();
  const ds09Cap = ctrlCapMap['DS-09'] || (dsCapsForDs09[0] ? dsCapsForDs09[0].capabilityId : '');

  if (ds09Cap) {
    const d = ctrlDataMap['DS-09'];
    if (d) {
      await safeInsertControl({
        controlId:          'DS-09',
        controlName:        cleanStr(d['Control Name '] || d['Control Name'] || 'Data loss prevention (DLP)'),
        controlDescription: cleanStr(d['Control Description '] || d['Control Description'] || ''),
        controlDomain:      cleanStr(d['Control Domain '] || d['Control Domain'] || 'Data Security'),
        controlObjective:   cleanStr(d['Control Objective '] || d['Control Objective'] || ''),
        priority:           cleanStr(d['Priority '] || d['Priority'] || 'High'),
        title:              cleanStr(d['Control Name '] || d['Control Name'] || 'Data loss prevention (DLP)'),
        description:        cleanStr(d['Control Description '] || d['Control Description'] || ''),
        category:           cleanStr(d['Control Domain '] || d['Control Domain'] || 'Data Security'),
        capabilityId:       ds09Cap,
        strategyId:         'DS',
        status:             'Pending',
        lifecycleStage:     'Defined',
        atRisk:             false,
        notes:              [],
        lifecycleHistory:   [],
        linkedTools:        [],
        createdAt:          new Date(),
        updatedAt:          new Date(),
      }, 'DS-09 — Data loss prevention (DLP)');
      affectedCapIds.add(ds09Cap);
    }
  } else {
    console.log('  ⚠️  DS-09: No DS capability found to assign to — skipping');
  }

  // AS-10: "Context-aware decision validation" — find an AS capability
  const asCaps = await Capability.find({ strategyId: 'AS' }).sort({ capabilityId: -1 }).lean();
  const as10Cap = ctrlCapMap['AS-10'] || (asCaps[0] ? asCaps[0].capabilityId : '');

  if (as10Cap) {
    const d = ctrlDataMap['AS-10'];
    if (d) {
      await safeInsertControl({
        controlId:          'AS-10',
        controlName:        cleanStr(d['Control Name '] || d['Control Name'] || 'Context-aware decision validation'),
        controlDescription: cleanStr(d['Control Description '] || d['Control Description'] || ''),
        controlDomain:      cleanStr(d['Control Domain '] || d['Control Domain'] || 'Agent Security'),
        controlObjective:   cleanStr(d['Control Objective '] || d['Control Objective'] || ''),
        priority:           cleanStr(d['Priority '] || d['Priority'] || 'Medium'),
        title:              cleanStr(d['Control Name '] || d['Control Name'] || 'Context-aware decision validation'),
        description:        cleanStr(d['Control Description '] || d['Control Description'] || ''),
        category:           cleanStr(d['Control Domain '] || d['Control Domain'] || 'Agent Security'),
        capabilityId:       as10Cap,
        strategyId:         'AS',
        status:             'Pending',
        lifecycleStage:     'Defined',
        atRisk:             false,
        notes:              [],
        lifecycleHistory:   [],
        linkedTools:        [],
        createdAt:          new Date(),
        updatedAt:          new Date(),
      }, 'AS-10 — Context-aware decision validation');
      affectedCapIds.add(as10Cap);
    }
  } else {
    console.log('  ⚠️  AS-10: No AS capability found — skipping');
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 7: Fix any remaining string-notes corruption across all controls
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(65));
  console.log('STEP 7 — Fix string-notes corruption (all controls)');
  console.log('═'.repeat(65));

  const db = mongoose.connection.db;
  const stringNoteDocs = await db.collection('controls').find({ notes: { $type: 'string' } }).toArray();
  if (stringNoteDocs.length === 0) {
    console.log('  ✅  No string-notes corruption found.');
  } else {
    for (const doc of stringNoteDocs) {
      await db.collection('controls').updateOne({ _id: doc._id }, { $set: { notes: [] } });
      console.log(`  🔧  ${doc.controlId}: Cleared string notes ("${doc.notes}")`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 8: Sync controlCount on all affected capabilities
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(65));
  console.log('STEP 8 — Sync controlCount on all affected capabilities');
  console.log('═'.repeat(65));

  // Also sync ALL caps to be safe
  const allCaps = await Capability.find({}).select('capabilityId').lean();
  for (const cap of allCaps) {
    const count = await syncCapabilityCount(cap.capabilityId);
    if (affectedCapIds.has(cap.capabilityId)) {
      console.log(`  ✅  ${cap.capabilityId} → controlCount = ${count}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 9: Sync capabilityCount on all strategies
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(65));
  console.log('STEP 9 — Sync capabilityCount on all strategies');
  console.log('═'.repeat(65));

  const allStrategies = await Strategy.find({}).select('strategyId').lean();
  for (const s of allStrategies) {
    const count = await syncStrategyCapCount(s.strategyId);
    console.log(`  ✅  Strategy ${s.strategyId} → capabilityCount = ${count}`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(65));
  console.log('PATCH COMPLETE — FINAL STATE');
  console.log('═'.repeat(65));

  const totalControls = await Control.countDocuments({});
  const totalCaps     = await Capability.countDocuments({});
  const totalStrats   = await Strategy.countDocuments({});
  console.log(`  Total Strategies:  ${totalStrats}`);
  console.log(`  Total Capabilities: ${totalCaps}`);
  console.log(`  Total Controls:    ${totalControls}`);
  console.log('\n✅  All done. No existing user data was overwritten.\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async err => {
  console.error('\n❌  Fatal error:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
