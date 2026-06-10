const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

const Strategy = require('../models/Strategy');
const Capability = require('../models/Capability');
const Control = require('../models/Control');
const Tool = require('../models/Tool');
const ControlToolMapping = require('../models/ControlToolMapping');

// Load the master JSON
const rawData = JSON.parse(fs.readFileSync('./data/master_data.json', 'utf-8'));

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_security_framework');
  
  // 1. Clear all collections first
  await Promise.all([
    Strategy.collection.drop().catch(() => {}),
    Capability.collection.drop().catch(() => {}),
    Control.collection.drop().catch(() => {}),
    Tool.collection.drop().catch(() => {}),
    ControlToolMapping.collection.drop().catch(() => {})
  ]);

  // 2. Collect unique tools first (dedup by toolId)
  const toolMap = new Map();
  
  for (const strategy of rawData) {
    for (const cap of strategy.Capabilities || []) {
      for (const ctrl of cap.Controls || []) {
        for (const tool of ctrl.Tools || []) {
          if (tool.ToolID && !toolMap.has(tool.ToolID)) {
            toolMap.set(tool.ToolID, {
              toolId: tool.ToolID,
              toolName: tool.ToolName,
              toolCategory: tool.ToolCategory,
              vendor: tool.Vendor,
              toolDescription: tool['Tool Description'],
              primaryFunction: tool['Primary Function'],
              aiControlRelevance: tool['AI Control Relevance']
            });
          }
        }
      }
    }
  }
  await Tool.insertMany([...toolMap.values()]);

  // 3. Seed strategies, capabilities, controls, mappings
  for (const strategy of rawData) {
    await Strategy.create({
      strategyId: strategy['Strategy ID'],
      strategyName: strategy['Strategy Name']?.trim(),
      strategyDescription: strategy['Strategy Description'],
      strategyOwner: strategy['Strategy Owner'],
      priority: strategy['Priority'],
      notes: strategy['Notes'],
      capabilityCount: (strategy.Capabilities || []).length
    });

    for (const cap of strategy.Capabilities || []) {
      await Capability.create({
        capabilityId: cap['Capability ID'],
        capabilityName: cap['Capability Name'],
        capabilityDescription: cap['Capability Description'],
        capabilityCategory: cap['Capability Category'],
        capabilityStatus: cap['Capability Status'],
        strategyId: strategy['Strategy ID'],
        controlCount: (cap.Controls || []).length
      });

      for (const ctrl of cap.Controls || []) {
        await Control.create({
          controlId: ctrl['Control ID'],
          controlName: ctrl['Control Name'],
          controlDescription: ctrl['Control Description'],
          controlDomain: ctrl['Control Domain'],
          controlObjective: ctrl['Control Objective'],
          owner: ctrl['Owner'],
          priority: ctrl['Priority'],
          status: ctrl['Status'],
          implementationState: ctrl['Implementation State'],
          lifecycleStage: ctrl['Lifecycle Stage'],
          capabilityId: cap['Capability ID'],
          strategyId: strategy['Strategy ID']
        });

        for (const tool of ctrl.Tools || []) {
          if (tool.ToolID) {
            await ControlToolMapping.create({
              controlId: ctrl['Control ID'],
              toolId: tool.ToolID
            });
          }
        }
      }
    }
  }
  
  console.log('Seed complete');
  process.exit(0);
}
seed().catch(err => {
  console.error(err);
  process.exit(1);
});
