/**
 * Phase 3 — Tool Migration Script
 * Extracts existing legacy string-based ToolControlMapping records and converts them
 * to the new Phase3ToolControlMapping collection using ObjectId references.
 * Copies toolName/toolCategory/toolDescription → name/category/description.
 * Triggers coverage score recalculation for all tools.
 *
 * Safe to run multiple times (idempotent).
 * Usage: node scripts/migratePhase3Tools.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Tool = require('../models/Tool');
const Control = require('../models/Control');
const Phase3ToolControlMapping = require('../models/Phase3ToolControlMapping');
const { TOOL_CATEGORIES } = require('../models/Tool');
const { recalculateAllCoverage } = require('../utils/coverage');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const db = mongoose.connection.db;
  const legacyMappingsColl = db.collection('toolcontrolmappings');

  // 1. Migrate Tools (Alias fields & Status)
  console.log('\n--- 1. Migrating Tools ---');
  const tools = await Tool.find();
  let toolsUpdated = 0;

  for (const tool of tools) {
    let needsSave = false;

    if (!tool.name && tool.toolName) { tool.name = tool.toolName; needsSave = true; }
    if (!tool.description && tool.toolDescription) { tool.description = tool.toolDescription; needsSave = true; }
    
    // Map legacy category to structured category if possible, else 'Other'
    if (!tool.category) {
        if (tool.toolCategory && TOOL_CATEGORIES.includes(tool.toolCategory)) {
            tool.category = tool.toolCategory;
        } else {
            tool.category = 'Other';
        }
        needsSave = true;
    }

    if (!tool.status) { tool.status = 'Active'; needsSave = true; }
    if (tool.coverageScore === undefined) { tool.coverageScore = 0; needsSave = true; }

    if (needsSave) {
      await tool.save();
      toolsUpdated++;
    }
  }
  console.log(`Updated ${toolsUpdated} tools with Phase 3 fields.`);

  // 2. Migrate Mappings to Phase3 mapping collection
  console.log('\n--- 2. Migrating Mappings ---');
  const legacyMappings = await legacyMappingsColl.find({}).toArray();
  let mappingsCreated = 0;
  let mappingsSkipped = 0;

  for (const lm of legacyMappings) {
    // lm has string toolId and string controlId
    const tool = await Tool.findOne({ toolId: lm.toolId });
    const control = await Control.findOne({ controlId: lm.controlId });

    if (!tool || !control) {
        // Orphaned mapping, skip
        mappingsSkipped++;
        continue;
    }

    // Check if new mapping already exists
    const existing = await Phase3ToolControlMapping.findOne({
        toolId: tool._id,
        controlId: control._id
    });

    if (!existing) {
        await Phase3ToolControlMapping.create({
            toolId: tool._id,
            controlId: control._id,
            verified: true, // assume existing mappings are verified
            description: 'Migrated from legacy mapping'
        });
        mappingsCreated++;
        
        // Also ensure it's in the control's linkedTools array
        if (!control.linkedTools.includes(tool._id)) {
            control.linkedTools.push(tool._id);
            await control.save();
        }
    } else {
        mappingsSkipped++;
    }
  }

  console.log(`Created ${mappingsCreated} new mappings. Skipped ${mappingsSkipped} (orphaned or duplicate).`);

  // 3. Recalculate Coverage
  console.log('\n--- 3. Recalculating Coverage ---');
  await recalculateAllCoverage();
  console.log('Coverage recalculation complete.');

  console.log('\nMigration complete.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
