/**
 * PATCH: Fix SD-01..SD-06 controls
 * 1. Remove duplicate Control documents (keep the newest _id per controlId)
 * 2. Backfill the `title` and `description` alias fields (currently "undefined")
 *
 * Run: node scripts/patch_fix_sd01_sd06.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Control  = require('../models/Control');

// Expected values straight from the image / MasterSheet
const EXPECTED = {
  'SD-01': { title: 'AI usage discovery',                   description: 'Detects AI services being used across the organization' },
  'SD-02': { title: 'SaaS AI detection',                    description: 'Detects use of external AI platforms and services' },
  'SD-03': { title: 'Network traffic analysis',             description: 'Monitors network traffic for AI service communications' },
  'SD-04': { title: 'Endpoint activity monitoring',         description: 'Detects AI usage on user devices and endpoints' },
  'SD-05': { title: 'Application discovery',                description: 'Identifies AI applications in use across the organization' },
  'SD-06': { title: 'AI traffic fingerprinting',            description: 'Identifies AI activity at the network/endpoint level' },
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  console.log('✅  Connected to MongoDB\n');

  for (const [controlId, { title, description }] of Object.entries(EXPECTED)) {
    // ── 1. Find all docs for this controlId ──────────────────────────────────
    const docs = await Control.find({ controlId }).sort({ _id: -1 }).lean();

    if (docs.length === 0) {
      console.log(`⚠️  ${controlId}: NOT FOUND in DB — skipping`);
      continue;
    }

    // ── 2. Deduplicate — keep the first (newest _id), delete the rest ────────
    if (docs.length > 1) {
      const keepId    = docs[0]._id;
      const deleteIds = docs.slice(1).map(d => d._id);
      await Control.deleteMany({ _id: { $in: deleteIds } });
      console.log(`🗑️   ${controlId}: Removed ${deleteIds.length} duplicate(s), kept _id=${keepId}`);
    } else {
      console.log(`✅  ${controlId}: No duplicates found`);
    }

    // ── 3. Backfill title / description / controlName if needed ─────────────
    const keeper = await Control.findOne({ controlId }).lean();
    const needsTitleFix       = !keeper.title       || keeper.title       === 'undefined';
    const needsDescFix        = !keeper.description || keeper.description === 'undefined';
    const needsNameFix        = !keeper.controlName || keeper.controlName === 'undefined';

    if (needsTitleFix || needsDescFix || needsNameFix) {
      const update = { updatedAt: new Date() };
      if (needsTitleFix)  update.title       = title;
      if (needsDescFix)   update.description = description;
      if (needsNameFix)   update.controlName = title;

      await Control.findOneAndUpdate({ controlId }, { $set: update });
      console.log(`   ✏️   ${controlId}: Backfilled → title="${title}"`);
    } else {
      console.log(`   ✅  ${controlId}: title already set ("${keeper.title}")`);
    }
  }

  // ── Verify final state ───────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(65));
  console.log('FINAL STATE — SD-01..SD-06');
  console.log('═'.repeat(65));

  const finalDocs = await Control
    .find({ controlId: { $in: Object.keys(EXPECTED) } })
    .select('controlId controlName title')
    .sort({ controlId: 1 })
    .lean();

  // Count per controlId
  const counts = {};
  for (const d of finalDocs) {
    counts[d.controlId] = (counts[d.controlId] || 0) + 1;
  }

  const seen = new Set();
  for (const d of finalDocs) {
    if (seen.has(d.controlId)) continue;
    seen.add(d.controlId);
    const dupWarn = counts[d.controlId] > 1 ? ` ⚠️ STILL ${counts[d.controlId]} DUPES` : '';
    const expected = EXPECTED[d.controlId];
    const nameMatch  = d.controlName === expected.title ? '✅' : `❌ (got "${d.controlName}")`;
    const titleMatch = d.title       === expected.title ? '✅' : `❌ (got "${d.title}")`;
    console.log(`  ${d.controlId}  controlName:${nameMatch}  title:${titleMatch}${dupWarn}`);
  }

  console.log('\n✅  Done.\n');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async err => {
  console.error('❌  Error:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
