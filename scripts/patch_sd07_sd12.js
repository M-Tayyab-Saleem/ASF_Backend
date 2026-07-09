/**
 * ============================================================
 * PATCH SCRIPT: Insert SD-07 through SD-12 Controls
 * Strategy: "Shadow AI Detection" (Strategy ID: "SA")
 * ============================================================
 *
 * Data sources cross-referenced from MasterSheet.xlsx:
 *   - Sheet "Controls "         → Control fields for SD-07..SD-12
 *   - Sheet "ToolControlMap "   → Which tools map to each control
 *   - Sheet "Tools"             → Full tool metadata
 *   - Sheet "CapabilityControlMapping" → Which CAP each SD-XX belongs to
 *
 * Capability → Control mappings (from CapabilityControlMapping + screenshot):
 *   SD-07 → CAP-097  (Shadow AI discovery)          ← already exists in SA
 *   SD-08 → CAP-111  (AI usage risk scoring)        ← NEW capability
 *   SD-09 → CAP-112  (User behavior analysis cap)   ← NEW capability
 *   SD-10 → CAP-113  (Shadow AI alerting)           ← NEW capability
 *   SD-11 → CAP-114  (Shadow AI audit logging)      ← NEW capability
 *   SD-12 → CAP-115  (Security tool integration)    ← NEW capability
 *
 * STRICT SAFETY RULES:
 *   - Uses findOne-before-create to NEVER overwrite existing documents.
 *   - Re-running this script multiple times is fully safe (idempotent).
 *   - No $set on existing capabilities or strategy unless only updating counts.
 * ============================================================
 *
 * Run from the backend/ directory:
 *   node scripts/patch_sd07_sd12.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

// ── Models ────────────────────────────────────────────────────────────────────
const Strategy           = require('../models/Strategy');
const Capability         = require('../models/Capability');
const Control            = require('../models/Control');
const Tool               = require('../models/Tool');
const ControlToolMapping = require('../models/ControlToolMapping');

// ════════════════════════════════════════════════════════════════════════════
// 1. STATIC DATA  (from MasterSheet.xlsx + screenshot image)
// ════════════════════════════════════════════════════════════════════════════

/**
 * NEW Capabilities to upsert (CAP-111..115).
 * SD-07 maps to CAP-097 which ALREADY exists – only verified, not re-created.
 */
const NEW_CAPABILITIES = [
  {
    capabilityId:          'CAP-111',
    strategyId:            'SA',
    capabilityName:        'AI usage risk scoring',
    capabilityDescription: 'Assigns risk scores to detected AI tools and usage patterns',
    capabilityCategory:    'Shadow AI Detection',
    capabilityStatus:      null,
  },
  {
    capabilityId:          'CAP-112',
    strategyId:            'SA',
    capabilityName:        'User behavior analysis',
    capabilityDescription: 'Monitor and analyze user behavioral patterns around AI tool usage',
    capabilityCategory:    'Shadow AI Detection',
    capabilityStatus:      null,
  },
  {
    capabilityId:          'CAP-113',
    strategyId:            'SA',
    capabilityName:        'Shadow AI alerting',
    capabilityDescription: 'Generate and route alerts for detected shadow AI activities',
    capabilityCategory:    'Shadow AI Detection',
    capabilityStatus:      null,
  },
  {
    capabilityId:          'CAP-114',
    strategyId:            'SA',
    capabilityName:        'Shadow AI audit logging',
    capabilityDescription: 'Maintain detailed audit trails of unauthorized AI usage events',
    capabilityCategory:    'Shadow AI Detection',
    capabilityStatus:      null,
  },
  {
    capabilityId:          'CAP-115',
    strategyId:            'SA',
    capabilityName:        'Security tool integration',
    capabilityDescription: 'Integrate shadow AI detection signals with SIEM, CASB, and security platforms',
    capabilityCategory:    'Shadow AI Detection',
    capabilityStatus:      null,
  },
];

/**
 * The 6 missing controls, fully built from Controls.csv + ToolControlMap.csv.
 *
 * toolIds: resolved from ToolControlMap sheet (TCM-SD-020 .. TCM-SD-039).
 *   SD-07: Zscaler(primary), Island(primary), Entra(supporting), Intune(supporting)
 *   SD-08: Reco(primary), PrismaPortal(primary), Sentinel(supporting)
 *   SD-09: PrismaPortal(primary), Reco(primary), Sentinel(supporting)
 *   SD-10: Sentinel(primary), Reco(supporting), Zscaler(supporting)
 *   SD-11: Sentinel(primary), Reco(supporting), PrismaPortal(supporting)
 *   SD-12: Sentinel(primary), Defender(supporting), Reco(supporting), Zscaler(supporting)
 */
const MISSING_CONTROLS = [
  {
    controlId:          'SD-07',
    controlName:        'Policy enforcement for unauthorized AI',
    controlDescription: 'Blocks or restricts access to unapproved AI services',
    controlDomain:      'Shadow AI Detection',
    controlObjective:   'Enforce governance over unauthorized AI usage',
    priority:           'High',
    capabilityId:       'CAP-097',   // existing capability: "Shadow AI discovery"
    strategyId:         'SA',
    toolIds:            ['Zscaler', 'Island', 'Entra', 'Intune'],
  },
  {
    controlId:          'SD-08',
    controlName:        'Risk scoring for AI usage',
    controlDescription: 'Assigns risk levels to detected AI tools and usage patterns',
    controlDomain:      'Shadow AI Detection',
    controlObjective:   'Prioritize risk associated with shadow AI usage',
    priority:           'Medium',
    capabilityId:       'CAP-111',
    strategyId:         'SA',
    toolIds:            ['Reco', 'PrismaPortal', 'Sentinel'],
  },
  {
    controlId:          'SD-09',
    controlName:        'User behavior analysis',
    controlDescription: 'Analyzes user behavior related to AI tool usage',
    controlDomain:      'Shadow AI Detection',
    controlObjective:   'Detect risky or abnormal user interactions with AI tools',
    priority:           'Medium',
    capabilityId:       'CAP-112',
    strategyId:         'SA',
    toolIds:            ['PrismaPortal', 'Reco', 'Sentinel'],
  },
  {
    controlId:          'SD-10',
    controlName:        'Alerting & notification',
    controlDescription: 'Generates alerts for detected shadow AI activity',
    controlDomain:      'Shadow AI Detection',
    controlObjective:   'Enable timely response to shadow AI risks',
    priority:           'High',
    capabilityId:       'CAP-113',
    strategyId:         'SA',
    toolIds:            ['Sentinel', 'Reco', 'Zscaler'],
  },
  {
    controlId:          'SD-11',
    controlName:        'Logging & audit trail',
    controlDescription: 'Records shadow AI usage for monitoring and investigation',
    controlDomain:      'Shadow AI Detection',
    controlObjective:   'Maintain auditability and traceability of AI usage',
    priority:           'Medium',
    capabilityId:       'CAP-114',
    strategyId:         'SA',
    toolIds:            ['Sentinel', 'Reco', 'PrismaPortal'],
  },
  {
    controlId:          'SD-12',
    controlName:        'Integration with security tools',
    controlDescription: 'Integrates with SIEM, CASB, and security platforms',
    controlDomain:      'Shadow AI Detection',
    controlObjective:   'Enable centralized monitoring and response',
    priority:           'Medium',
    capabilityId:       'CAP-115',
    strategyId:         'SA',
    toolIds:            ['Sentinel', 'Defender', 'Reco', 'Zscaler'],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// 2. HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Safe single-document insert.
 * Checks for existence first; if already present, skips and returns existing.
 * NEVER overwrites existing documents.
 */
async function safeInsertOne(Model, query, data, label) {
  const existing = await Model.findOne(query).lean();
  if (existing) {
    console.log(`  ⚡ SKIP [already exists]: ${label}`);
    return existing;
  }
  try {
    const doc = await Model.create(data);
    console.log(`  ✅ INSERTED: ${label}  (_id: ${doc._id})`);
    return doc.toObject ? doc.toObject() : doc;
  } catch (err) {
    if (err.code === 11000) {
      // Race condition: another process inserted between our findOne and create
      const existing2 = await Model.findOne(query).lean();
      console.log(`  ⚡ SKIP [race-condition duplicate]: ${label}`);
      return existing2;
    }
    throw err;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 3. MAIN PATCH FUNCTION
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('❌  MONGODB_URI not set in .env file. Aborting.');
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  PATCH: SD-07 → SD-12 into Strategy SA (Shadow AI Detection)');
  console.log('═'.repeat(60));
  console.log('\n🔌  Connecting to MongoDB...');

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  console.log('✅  Connected to MongoDB.\n');

  // ── Pre-flight: verify Strategy SA ────────────────────────────────────────
  const strategy = await Strategy.findOne({ strategyId: 'SA' }).lean();
  if (!strategy) {
    console.error('❌  Strategy "SA" not found in DB. Seed the strategies first.');
    process.exit(1);
  }
  console.log(`✅  Strategy found: strategyId=SA  name="${strategy.strategyName}"\n`);

  // ══════════════════════════════════════════════════════════════
  // STEP 1: Ensure all required Capabilities exist
  // ══════════════════════════════════════════════════════════════
  console.log('─'.repeat(60));
  console.log('STEP 1 — Ensuring Capabilities exist in DB');
  console.log('─'.repeat(60));

  // Verify CAP-097 (must already exist for SD-07)
  const cap097 = await Capability.findOne({ capabilityId: 'CAP-097' }).lean();
  if (!cap097) {
    console.error('  ⚠️  CAP-097 not found! Creating it now...');
    await safeInsertOne(
      Capability,
      { capabilityId: 'CAP-097' },
      {
        capabilityId:          'CAP-097',
        strategyId:            'SA',
        capabilityName:        'Shadow AI discovery',
        capabilityDescription: 'Identify unknown or unapproved AI tools',
        capabilityCategory:    'Shadow AI Detection',
        capabilityStatus:      null,
        controlCount:          0,
      },
      'CAP-097 — Shadow AI discovery'
    );
  } else {
    console.log(`  ⚡ VERIFIED [exists]: CAP-097 — Shadow AI discovery`);
  }

  // Insert new capabilities
  for (const cap of NEW_CAPABILITIES) {
    await safeInsertOne(
      Capability,
      { capabilityId: cap.capabilityId },
      { ...cap, controlCount: 0 },
      `${cap.capabilityId} — ${cap.capabilityName}`
    );
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // STEP 2: Resolve Tool ObjectIds
  // ══════════════════════════════════════════════════════════════
  console.log('─'.repeat(60));
  console.log('STEP 2 — Resolving Tool documents from Tool collection');
  console.log('─'.repeat(60));

  const allToolIds = [...new Set(MISSING_CONTROLS.flatMap(c => c.toolIds))];
  const toolDocs   = await Tool.find({ toolId: { $in: allToolIds } }).lean();
  const toolMap    = {};
  for (const t of toolDocs) {
    toolMap[t.toolId] = t;
    console.log(`  ✅  ${t.toolId.padEnd(14)} → ObjectId(${t._id})  [${t.toolName}]`);
  }
  for (const id of allToolIds) {
    if (!toolMap[id]) {
      console.log(`  ⚠️  Tool NOT FOUND in DB: "${id}" — will be omitted from linkedTools`);
    }
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // STEP 3: Insert Control documents (SD-07 through SD-12)
  // ══════════════════════════════════════════════════════════════
  console.log('─'.repeat(60));
  console.log('STEP 3 — Inserting Control documents SD-07 through SD-12');
  console.log('─'.repeat(60));

  const insertedControls = [];

  for (const ctrl of MISSING_CONTROLS) {
    const { toolIds, ...controlFields } = ctrl;

    const linkedTools = toolIds
      .filter(id => toolMap[id])
      .map(id => toolMap[id]._id);

    console.log(`\n  ── ${ctrl.controlId}: "${ctrl.controlName}"`);
    console.log(`     Insertion path → Strategy[SA] › Capability[${ctrl.capabilityId}] › Controls`);
    console.log(`     Priority: ${ctrl.priority}  |  Tools (${linkedTools.length}): ${toolIds.join(', ')}`);

    const controlDoc = await safeInsertOne(
      Control,
      { controlId: ctrl.controlId },
      {
        ...controlFields,
        // Phase 3 alias fields
        title:             ctrl.controlName,
        description:       ctrl.controlDescription,
        category:          ctrl.controlDomain,
        // Status & lifecycle defaults
        status:            'Pending',
        lifecycleStage:    'Defined',
        atRisk:            false,
        lifecycleHistory:  [],
        // Tool refs
        linkedTools,
        // Audit
        createdAt:         new Date(),
        updatedAt:         new Date(),
      },
      `Control ${ctrl.controlId} — ${ctrl.controlName}`
    );

    insertedControls.push({ ctrl, controlDoc });
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // STEP 4: Upsert ControlToolMapping junction records
  // ══════════════════════════════════════════════════════════════
  console.log('─'.repeat(60));
  console.log('STEP 4 — Upserting ControlToolMapping records');
  console.log('─'.repeat(60));

  for (const { ctrl } of insertedControls) {
    for (const toolId of ctrl.toolIds) {
      if (!toolMap[toolId]) continue;
      try {
        const result = await ControlToolMapping.findOneAndUpdate(
          { controlId: ctrl.controlId, toolId },
          { $setOnInsert: { controlId: ctrl.controlId, toolId } },
          { upsert: true, new: true }
        );
        console.log(`  ✅  Mapped: ${ctrl.controlId} ↔ ${toolId}`);
      } catch (err) {
        if (err.code === 11000) {
          console.log(`  ⚡ SKIP [already exists]: ${ctrl.controlId} ↔ ${toolId}`);
        } else {
          console.error(`  ❌  Error mapping ${ctrl.controlId} ↔ ${toolId}:`, err.message);
        }
      }
    }
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // STEP 5: Sync controlCount on affected Capabilities
  // ══════════════════════════════════════════════════════════════
  console.log('─'.repeat(60));
  console.log('STEP 5 — Syncing controlCount on affected Capabilities');
  console.log('─'.repeat(60));

  const affectedCapIds = [...new Set(MISSING_CONTROLS.map(c => c.capabilityId))];
  for (const capId of affectedCapIds) {
    const count = await Control.countDocuments({ capabilityId: capId });
    await Capability.findOneAndUpdate(
      { capabilityId: capId },
      { $set: { controlCount: count } }
    );
    console.log(`  ✅  ${capId} → controlCount = ${count}`);
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // STEP 6: Sync capabilityCount on Strategy SA
  // ══════════════════════════════════════════════════════════════
  console.log('─'.repeat(60));
  console.log('STEP 6 — Syncing capabilityCount on Strategy SA');
  console.log('─'.repeat(60));

  const totalCaps = await Capability.countDocuments({ strategyId: 'SA' });
  await Strategy.findOneAndUpdate(
    { strategyId: 'SA' },
    { $set: { capabilityCount: totalCaps } }
  );
  console.log(`  ✅  Strategy SA → capabilityCount = ${totalCaps}`);
  console.log();

  // ══════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ══════════════════════════════════════════════════════════════
  console.log('═'.repeat(60));
  console.log('  PATCH COMPLETE — INSERTION SUMMARY');
  console.log('═'.repeat(60));
  console.log('  Control  │ Capability │ Tools Linked');
  console.log('  ─────────┼────────────┼─────────────────────────────────');
  for (const { ctrl } of insertedControls) {
    const toolStr = ctrl.toolIds
      .filter(id => toolMap[id])
      .join(', ');
    console.log(`  ${ctrl.controlId.padEnd(8)} │ ${ctrl.capabilityId.padEnd(10)} │ ${toolStr}`);
  }
  console.log('═'.repeat(60));
  console.log('\n✅  Done. No existing documents were overwritten.\n');

  await mongoose.disconnect();
  process.exit(0);
}

// ════════════════════════════════════════════════════════════════════════════
// 4. ENTRY POINT
// ════════════════════════════════════════════════════════════════════════════
main().catch(async err => {
  console.error('\n❌  Fatal error during patch:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
