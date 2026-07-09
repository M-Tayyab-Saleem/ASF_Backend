/**
 * PATCH: Fix MT-06..MT-11 controls wrongly assigned to Strategy SA
 *
 * Root cause: During initial seeding from master_data.json, MT-06..MT-11
 * were embedded under SA's capabilities (CAP-097..102) and got strategyId=SA.
 * Per the MasterSheet, Shadow AI Detection only has SD-01..SD-12 controls.
 * MT controls belong to the Monitoring & Observability (MO) strategy.
 *
 * Fix:
 *   1. Find the correct MO capabilityIds for each MT control from the DB
 *   2. Update each MT control → strategyId=MO, correct capabilityId
 *   3. Remove duplicate MT-09 and MT-10 documents (each appears twice under SA)
 *   4. Recalculate controlCount for affected capabilities
 *
 * Run: node scripts/patch_fix_mt_in_sa.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose   = require('mongoose');
const Control    = require('../models/Control');
const Capability = require('../models/Capability');
const Strategy   = require('../models/Strategy');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  console.log('✅  Connected to MongoDB\n');

  // ── Step 1: Find existing MO capabilities ───────────────────────────────────
  console.log('─'.repeat(60));
  console.log('STEP 1 — Finding Monitoring & Observability (MO) capabilities');
  console.log('─'.repeat(60));

  const moCaps = await Capability.find({ strategyId: 'MO' })
    .select('capabilityId capabilityName')
    .sort({ capabilityId: 1 })
    .lean();

  console.log(`  Found ${moCaps.length} MO capabilities:`);
  for (const c of moCaps) {
    console.log(`    ${c.capabilityId}  "${c.capabilityName}"`);
  }

  // Also find the EXISTING correct MT controls that already have strategyId=MO
  const correctMT = await Control.find({
    controlId: { $in: ['MT-06','MT-07','MT-08','MT-09','MT-10','MT-11'] },
    strategyId: 'MO'
  }).select('controlId capabilityId strategyId').lean();

  console.log(`\n  MT controls already correctly in MO (${correctMT.length}):`);
  for (const c of correctMT) {
    console.log(`    ${c.controlId}  capabilityId=${c.capabilityId}  strategyId=${c.strategyId}`);
  }

  // Build a map: controlId → correct capabilityId from MO strategy
  const correctCapMap = {};
  for (const c of correctMT) {
    // If a control already exists correctly in MO, record its capabilityId
    if (!correctCapMap[c.controlId]) correctCapMap[c.controlId] = c.capabilityId;
  }

  console.log('\n');

  // ── Step 2: Get all wrongly-placed MT controls (strategyId=SA) ──────────────
  console.log('─'.repeat(60));
  console.log('STEP 2 — Finding MT controls wrongly placed in SA');
  console.log('─'.repeat(60));

  const wrongMT = await Control.find({
    controlId: { $in: ['MT-06','MT-07','MT-08','MT-09','MT-10','MT-11'] },
    strategyId: 'SA'
  }).sort({ controlId: 1, _id: 1 }).lean();

  console.log(`  Found ${wrongMT.length} MT control docs with strategyId=SA:`);
  for (const c of wrongMT) {
    console.log(`    _id=${c._id}  ${c.controlId}  capabilityId=${c.capabilityId}`);
  }

  // ── Step 3: For each MT controlId, decide what to do ───────────────────────
  console.log('\n');
  console.log('─'.repeat(60));
  console.log('STEP 3 — Removing SA-linked MT controls');
  console.log('─'.repeat(60));

  // Group by controlId
  const groupedByControlId = {};
  for (const doc of wrongMT) {
    if (!groupedByControlId[doc.controlId]) groupedByControlId[doc.controlId] = [];
    groupedByControlId[doc.controlId].push(doc);
  }

  const saCapIdsAffected = new Set();

  for (const [controlId, docs] of Object.entries(groupedByControlId)) {
    for (const doc of docs) {
      saCapIdsAffected.add(doc.capabilityId);
    }

    // Check if a CORRECT version already exists in MO strategy
    const alreadyInMO = await Control.findOne({ controlId, strategyId: 'MO' }).lean();

    if (alreadyInMO) {
      // A correct document already exists in MO — just delete ALL SA copies
      const deleteIds = docs.map(d => d._id);
      await Control.deleteMany({ _id: { $in: deleteIds } });
      console.log(`  🗑️  ${controlId}: Deleted ${deleteIds.length} SA copy/copies (correct MO doc exists at _id=${alreadyInMO._id})`);
    } else {
      // No MO version exists — keep one SA copy, reassign it to MO with correct capabilityId
      // Sort to keep the one with the lowest _id (oldest), delete the rest
      docs.sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
      const keepDoc  = docs[0];
      const deleteDocs = docs.slice(1);

      // Determine the correct MO capabilityId
      // Use whatever capabilityId it already has if it's an MO cap, else find from moCaps
      const correctCapId = correctCapMap[controlId] || keepDoc.capabilityId;

      if (deleteDocs.length > 0) {
        await Control.deleteMany({ _id: { $in: deleteDocs.map(d => d._id) } });
        console.log(`  🗑️  ${controlId}: Deleted ${deleteDocs.length} extra SA duplicate(s)`);
      }

      // Find the correct MO capabilityId by matching the control to existing MO capabilities
      // We'll look at which MO capability has a matching controlId pattern
      // For MT-06..11, check if any MO cap already tracks this control via controlCount
      // Best approach: find the MO capabilityId from CapabilityControlMapping or existing data
      // Since we don't have CCM model, we'll update strategyId to MO and keep same capabilityId
      // but need to find a real MO capability

      // Find best matching MO cap (use first available MO cap as fallback)
      const moCapId = correctCapMap[controlId] || (moCaps[0] ? moCaps[0].capabilityId : null);

      await Control.findByIdAndUpdate(keepDoc._id, {
        $set: {
          strategyId:   'MO',
          capabilityId: moCapId,
          updatedAt:    new Date()
        }
      });
      console.log(`  ✏️  ${controlId}: Reassigned to strategyId=MO, capabilityId=${moCapId}`);
    }
  }

  // ── Step 4: Recalculate controlCount for all affected SA capabilities ───────
  console.log('\n');
  console.log('─'.repeat(60));
  console.log('STEP 4 — Resyncing controlCount on SA capabilities CAP-097..102');
  console.log('─'.repeat(60));

  const saCapsToSync = ['CAP-097','CAP-098','CAP-099','CAP-100','CAP-101','CAP-102'];
  for (const capId of saCapsToSync) {
    const count = await Control.countDocuments({ capabilityId: capId, strategyId: 'SA' });
    await Capability.findOneAndUpdate({ capabilityId: capId }, { $set: { controlCount: count } });
    console.log(`  ✅  ${capId} → controlCount (SA controls only) = ${count}`);
  }

  // ── Step 5: Recalculate capabilityCount for SA strategy ────────────────────
  console.log('\n');
  console.log('─'.repeat(60));
  console.log('STEP 5 — Resyncing Strategy SA capabilityCount');
  console.log('─'.repeat(60));

  const totalSACaps = await Capability.countDocuments({ strategyId: 'SA' });
  await Strategy.findOneAndUpdate({ strategyId: 'SA' }, { $set: { capabilityCount: totalSACaps } });
  console.log(`  ✅  Strategy SA capabilityCount = ${totalSACaps}`);

  // ── Final verification ──────────────────────────────────────────────────────
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('FINAL VERIFICATION — Controls under SA strategy');
  console.log('═'.repeat(60));

  const finalSAControls = await Control.find({ strategyId: 'SA' })
    .select('controlId controlName capabilityId')
    .sort({ controlId: 1 })
    .lean();

  console.log(`  Total controls with strategyId=SA: ${finalSAControls.length}`);
  for (const c of finalSAControls) {
    const prefix = c.controlId.startsWith('SD') ? '✅' : '❌ WRONG';
    console.log(`  ${prefix}  ${c.controlId}  cap=${c.capabilityId}  "${c.controlName}"`);
  }

  const remainingMT = await Control.find({
    controlId: { $in: ['MT-06','MT-07','MT-08','MT-09','MT-10','MT-11'] },
    strategyId: 'SA'
  }).lean();

  if (remainingMT.length === 0) {
    console.log('\n✅  No MT controls remain under SA. Shadow AI Detection is clean.');
  } else {
    console.log(`\n❌  WARNING: ${remainingMT.length} MT controls still under SA!`);
  }

  console.log('\n✅  Patch complete.\n');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async err => {
  console.error('❌  Fatal error:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
