/**
 * PATCH: Fix SD-01..SD-06 controls — wrong strategyId=TD → correct strategyId=SA
 *
 * These controls were seeded with strategyId=TD (Threat Detection) because
 * the CapabilityControlMapping sheet mapped them to CAP-105..110 (TD caps).
 * However the Controls sheet clearly marks their domain as "Shadow AI Detection"
 * and the MasterSheet image confirms they belong to Strategy SA.
 *
 * SD-01..06 need to sit under SA capabilities. We will assign them to the
 * existing SA capabilities CAP-097..102 (one control per capability):
 *
 *   SD-01 → CAP-097  (Shadow AI discovery)
 *   SD-02 → CAP-098  (SaaS AI usage detection)
 *   SD-03 → CAP-099  (Internal AI discovery)
 *   SD-04 → CAP-100  (External AI detection)
 *   SD-05 → CAP-101  (Endpoint AI traffic detection)
 *   SD-06 → CAP-102  (AI usage risk scoring)
 *
 * Run: node scripts/patch_fix_sd01_strategy.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose   = require('mongoose');
const Control    = require('../models/Control');
const Capability = require('../models/Capability');
const Strategy   = require('../models/Strategy');

// Authoritative mapping: SD-01..06 → correct SA capability
const SD_TO_CAP = {
  'SD-01': 'CAP-097',  // Shadow AI discovery
  'SD-02': 'CAP-098',  // SaaS AI usage detection
  'SD-03': 'CAP-099',  // Internal AI discovery
  'SD-04': 'CAP-100',  // External AI detection
  'SD-05': 'CAP-101',  // Endpoint AI traffic detection
  'SD-06': 'CAP-102',  // AI usage risk scoring
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  console.log('✅  Connected to MongoDB\n');

  // ── Step 1: Verify SA capabilities exist ─────────────────────────────────
  console.log('─'.repeat(60));
  console.log('STEP 1 — Verifying target SA capabilities exist');
  console.log('─'.repeat(60));

  const targetCapIds = [...new Set(Object.values(SD_TO_CAP))];
  const saCaps = await Capability.find({ capabilityId: { $in: targetCapIds } })
    .select('capabilityId capabilityName strategyId').lean();

  const capMap = {};
  for (const c of saCaps) {
    capMap[c.capabilityId] = c;
    console.log(`  ✅  ${c.capabilityId}  strategyId=${c.strategyId}  "${c.capabilityName}"`);
  }

  const missingCaps = targetCapIds.filter(id => !capMap[id]);
  if (missingCaps.length > 0) {
    console.error(`  ❌  Missing capabilities: ${missingCaps.join(', ')} — aborting`);
    process.exit(1);
  }
  console.log();

  // ── Step 2: Fix each SD-01..06 control ───────────────────────────────────
  console.log('─'.repeat(60));
  console.log('STEP 2 — Updating strategyId and capabilityId for SD-01..SD-06');
  console.log('─'.repeat(60));

  for (const [controlId, capabilityId] of Object.entries(SD_TO_CAP)) {
    const docs = await Control.find({ controlId }).sort({ _id: 1 }).lean();

    if (docs.length === 0) {
      console.log(`  ⚠️  ${controlId}: NOT FOUND in DB — skipping`);
      continue;
    }

    if (docs.length > 1) {
      // Keep newest, delete older duplicates
      const keepId    = docs[docs.length - 1]._id;
      const deleteIds = docs.slice(0, -1).map(d => d._id);
      await Control.deleteMany({ _id: { $in: deleteIds } });
      console.log(`  🗑️  ${controlId}: Removed ${deleteIds.length} duplicate(s), keeping _id=${keepId}`);
    }

    // Update the surviving document
    const result = await Control.findOneAndUpdate(
      { controlId },
      {
        $set: {
          strategyId:   'SA',
          capabilityId,
          updatedAt:    new Date()
        }
      },
      { returnDocument: 'after' }
    );

    const wasWrong = docs[0].strategyId !== 'SA' || docs[0].capabilityId !== capabilityId;
    if (wasWrong) {
      console.log(`  ✏️  ${controlId}: strategyId ${docs[0].strategyId}→SA, capabilityId ${docs[0].capabilityId}→${capabilityId}`);
    } else {
      console.log(`  ✅  ${controlId}: Already correct (strategyId=SA, capabilityId=${capabilityId})`);
    }
  }
  console.log();

  // ── Step 3: Sync controlCount on all affected SA capabilities ────────────
  console.log('─'.repeat(60));
  console.log('STEP 3 — Syncing controlCount for all SA capabilities');
  console.log('─'.repeat(60));

  const allSACaps = await Capability.find({ strategyId: 'SA' })
    .select('capabilityId').lean();

  for (const cap of allSACaps) {
    const count = await Control.countDocuments({
      capabilityId: cap.capabilityId,
      strategyId:   'SA'
    });
    await Capability.findOneAndUpdate(
      { capabilityId: cap.capabilityId },
      { $set: { controlCount: count } }
    );
    console.log(`  ✅  ${cap.capabilityId} → controlCount = ${count}`);
  }
  console.log();

  // ── Step 4: Sync Strategy SA capabilityCount ─────────────────────────────
  console.log('─'.repeat(60));
  console.log('STEP 4 — Syncing Strategy SA capabilityCount');
  console.log('─'.repeat(60));

  const totalCaps = await Capability.countDocuments({ strategyId: 'SA' });
  await Strategy.findOneAndUpdate(
    { strategyId: 'SA' },
    { $set: { capabilityCount: totalCaps } }
  );
  console.log(`  ✅  Strategy SA capabilityCount = ${totalCaps}`);
  console.log();

  // ── Final verification ────────────────────────────────────────────────────
  console.log('═'.repeat(60));
  console.log('FINAL VERIFICATION — All SD controls under SA strategy');
  console.log('═'.repeat(60));

  const allSDControls = await Control.find({
    controlId: { $in: ['SD-01','SD-02','SD-03','SD-04','SD-05','SD-06',
                        'SD-07','SD-08','SD-09','SD-10','SD-11','SD-12'] }
  }).select('controlId controlName strategyId capabilityId')
    .sort({ controlId: 1 }).lean();

  let allOk = true;
  for (const c of allSDControls) {
    const ok = c.strategyId === 'SA' ? '✅' : '❌';
    if (c.strategyId !== 'SA') allOk = false;
    console.log(`  ${ok}  ${c.controlId}  strategyId=${c.strategyId}  cap=${c.capabilityId}  "${c.controlName}"`);
  }

  if (allOk && allSDControls.length === 12) {
    console.log('\n✅  All 12 SD controls (SD-01..SD-12) are correctly assigned to strategyId=SA.');
  } else {
    console.log(`\n⚠️  Found ${allSDControls.length}/12 SD controls. Some may still need attention.`);
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
