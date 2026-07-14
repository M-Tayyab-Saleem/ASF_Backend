/**
 * Fix GC-06..GC-12 capabilityId — they have strategyId=GC but capabilityId pointing to MO caps.
 * Find proper GC capabilities for them from XLSX CCM, then assign.
 *
 * Per XLSX CCM these controls DON'T appear in CCM (they were orphaned controls from original seeding).
 * So we assign them to existing GC capabilities by matching domain/name similarity.
 */
'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose   = require('mongoose');
const Control    = require('../models/Control');
const Capability = require('../models/Capability');
const Strategy   = require('../models/Strategy');

async function syncCapabilityCount(capabilityId) {
  const count = await Control.countDocuments({ capabilityId });
  await Capability.findOneAndUpdate({ capabilityId }, { $set: { controlCount: count } });
  return count;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  console.log('✅ Connected\n');

  // Get all GC capabilities
  const gcCaps = await Capability.find({ strategyId: 'GC' }).sort({ capabilityId: 1 }).lean();
  console.log('GC capabilities:');
  for (const c of gcCaps) console.log(`  ${c.capabilityId}  "${c.capabilityName}"`);

  // Get GC-06..12 controls
  const gcControls = await Control.find({
    controlId: { $in: ['GC-06','GC-07','GC-08','GC-09','GC-10','GC-11','GC-12'] }
  }).lean();

  console.log('\nGC-06..12 current state:');
  for (const c of gcControls) {
    console.log(`  ${c.controlId}  strategyId=${c.strategyId}  capabilityId=${c.capabilityId}  "${c.controlName}"`);
  }

  // Match each control to best GC capability by name similarity
  // GC caps available:
  //   CAP-082 "AI risk assessment framework"
  //   CAP-083 "AI compliance management"
  //   CAP-084 "AI governance policies"
  //   CAP-085 "AI audit management"
  //   CAP-086 "Data governance integration"
  //   ... etc (we'll print them above)
  //
  // GC controls:
  //   GC-06: "AI risk assessment"          → best: risk-related cap
  //   GC-07: "AI risk scoring"             → best: risk-related cap
  //   GC-08: "Approval workflows"          → best: governance policies cap
  //   GC-09: "Compliance reporting"        → best: compliance cap
  //   GC-10: "Audit management"            → best: audit cap
  //   GC-11: "Data governance integration" → best: data governance cap
  //   GC-12: "Logging & audit trail"       → best: audit cap

  // Find the right caps by partial name match
  const findCap = (keyword) => {
    const cap = gcCaps.find(c =>
      c.capabilityName.toLowerCase().includes(keyword.toLowerCase())
    );
    return cap ? cap.capabilityId : gcCaps[0]?.capabilityId;
  };

  const GC_CTRL_CAP_MAP = {
    'GC-06': findCap('risk'),
    'GC-07': findCap('risk'),
    'GC-08': findCap('governance') || findCap('policy') || findCap('compliance'),
    'GC-09': findCap('compliance'),
    'GC-10': findCap('audit'),
    'GC-11': findCap('data governance') || findCap('data'),
    'GC-12': findCap('audit'),
  };

  console.log('\nPlanned assignment:');
  for (const [ctrlId, capId] of Object.entries(GC_CTRL_CAP_MAP)) {
    const cap = gcCaps.find(c => c.capabilityId === capId);
    console.log(`  ${ctrlId} → ${capId} "${cap?.capabilityName}"`);
  }

  const affectedCaps = new Set();

  console.log('\nApplying fixes:');
  for (const [controlId, capabilityId] of Object.entries(GC_CTRL_CAP_MAP)) {
    const ctrl = await Control.findOne({ controlId }).lean();
    if (!ctrl) { console.log(`  ⚠️  ${controlId}: NOT FOUND`); continue; }

    if (ctrl.capabilityId === capabilityId && ctrl.strategyId === 'GC') {
      console.log(`  ✅  ${controlId}: Already correct (cap=${capabilityId}, strat=GC)`);
      continue;
    }

    affectedCaps.add(ctrl.capabilityId); // old cap
    affectedCaps.add(capabilityId);       // new cap

    await Control.findOneAndUpdate(
      { controlId },
      { $set: { capabilityId, strategyId: 'GC', updatedAt: new Date() } }
    );
    console.log(`  ✏️  ${controlId}: cap ${ctrl.capabilityId}→${capabilityId}, strat ${ctrl.strategyId}→GC`);
  }

  // Sync counts
  console.log('\nSyncing controlCounts:');
  for (const capId of affectedCaps) {
    const count = await syncCapabilityCount(capId);
    console.log(`  ✅  ${capId} → controlCount = ${count}`);
  }

  const gcCapCount = await Capability.countDocuments({ strategyId: 'GC' });
  await Strategy.findOneAndUpdate({ strategyId: 'GC' }, { $set: { capabilityCount: gcCapCount } });
  const moCapCount = await Capability.countDocuments({ strategyId: 'MO' });
  await Strategy.findOneAndUpdate({ strategyId: 'MO' }, { $set: { capabilityCount: moCapCount } });
  console.log(`\n  Strategy GC capabilityCount = ${gcCapCount}`);
  console.log(`  Strategy MO capabilityCount = ${moCapCount}`);

  console.log('\n✅ Done.\n');
  await mongoose.disconnect();
}

main().catch(console.error);
