/**
 * Phase 3 — Control Migration Script
 * Maps old 3-status system → new 5-stage lifecycle.
 * Copies controlName/controlDescription/controlDomain → title/description/category aliases.
 * Seeds lifecycleHistory with one entry per control if empty.
 *
 * Mapping:
 *   Pending          → Defined
 *   Implemented      → Implemented
 *   Not Implemented  → Defined + atRisk: true
 *
 * Safe to run multiple times (idempotent).
 * Usage: node scripts/migratePhase3Controls.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const STATUS_MAP = {
  'Implemented':     'Implemented',
  'Pending':         'Defined',
  'Not Implemented': 'Defined',
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const db = mongoose.connection.db;
  const controls = db.collection('controls');

  const all = await controls.find({}).toArray();
  console.log(`Found ${all.length} controls to process.`);

  let updated = 0;
  let skipped = 0;

  for (const ctrl of all) {
    const updateFields = {};

    // ── Map aliases ──────────────────────────────────────────────────────
    if (!ctrl.title && ctrl.controlName)               updateFields.title       = ctrl.controlName;
    if (!ctrl.description && ctrl.controlDescription)  updateFields.description = ctrl.controlDescription;
    if (!ctrl.category && ctrl.controlDomain)          updateFields.category    = ctrl.controlDomain;

    // ── Map lifecycle stage ──────────────────────────────────────────────
    // Only migrate if lifecycleStage is not already one of the new enum values
    const newStageValues = ['Defined', 'Implemented', 'Evidence Added', 'Validated', 'Review'];
    if (!ctrl.lifecycleStage || !newStageValues.includes(ctrl.lifecycleStage)) {
      const mappedStage = STATUS_MAP[ctrl.status] || 'Defined';
      updateFields.lifecycleStage = mappedStage;

      // At Risk flag for Not Implemented controls
      if (ctrl.status === 'Not Implemented') {
        updateFields.atRisk = true;
      }
    }

    // ── Seed lifecycle history if empty ──────────────────────────────────
    if (!ctrl.lifecycleHistory || ctrl.lifecycleHistory.length === 0) {
      const stage = updateFields.lifecycleStage || ctrl.lifecycleStage || 'Defined';
      updateFields.lifecycleHistory = [{
        stage,
        changedBy: null,
        changedAt: ctrl.createdAt || new Date(),
        reason: 'Seeded by Phase 3 migration'
      }];
    }

    // Ensure atRisk field exists
    if (ctrl.atRisk === undefined) {
      updateFields.atRisk = updateFields.atRisk || false;
    }

    if (Object.keys(updateFields).length === 0) {
      skipped++;
      continue;
    }

    await controls.updateOne(
      { _id: ctrl._id },
      { $set: updateFields }
    );
    updated++;
  }

  console.log(`Migration complete: ${updated} updated, ${skipped} already up-to-date.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
