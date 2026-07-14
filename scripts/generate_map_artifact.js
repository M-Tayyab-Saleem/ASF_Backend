require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const XLSX_PATH = path.resolve(__dirname, '../../MasterSheet.xlsx');
const Tool = require('../models/Tool');
const Control = require('../models/Control');
const Capability = require('../models/Capability');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  
  // 1. Get Tools from MasterSheet
  const wb = xlsx.readFile(XLSX_PATH);
  const xlsxToolsData = xlsx.utils.sheet_to_json(wb.Sheets['Tools']);
  const xlsxTools = {};
  for (const r of xlsxToolsData) {
    const id = (r['ToolID'] || r['Tool ID'] || '').toString().trim();
    if (id) xlsxTools[id] = r;
  }

  // 2. Get Tools from DB
  const dbToolsData = await Tool.find({}).lean();
  const dbTools = {};
  for (const t of dbToolsData) {
    if (t.toolId) dbTools[t.toolId] = t;
  }

  // 3. Difference Analysis
  const xlsxNames = Object.values(xlsxTools).map(t => t['ToolName'] || t['Tool Name']);
  const dbNames = Object.values(dbTools).map(t => t.toolName);

  // 4. Map Original Tools -> Controls -> Capabilities
  const tcmData = xlsx.utils.sheet_to_json(wb.Sheets['ToolControlMap ']);
  // Build Tool -> Controls mapping
  const origToolToControls = {};
  for (const row of tcmData) {
    const tId = (row['ToolID'] || '').toString().trim();
    const cId = (row['ControlID'] || '').toString().trim();
    if (tId && cId) {
      if (!origToolToControls[tId]) origToolToControls[tId] = new Set();
      origToolToControls[tId].add(cId);
    }
  }

  // Build Control -> Capability mapping from DB (it's more reliable than the messy XLSX CCM)
  const allControls = await Control.find({}).lean();
  const controlToCap = {};
  for (const c of allControls) {
    controlToCap[c.controlId] = c.capabilityId;
  }

  // Build Original Tool -> Capabilities mapping
  const origToolToCaps = {};
  for (const [tId, cIds] of Object.entries(origToolToControls)) {
    origToolToCaps[tId] = new Set();
    for (const cId of cIds) {
      const capId = controlToCap[cId];
      if (capId) origToolToCaps[tId].add(capId);
    }
  }

  // 5. Match New Tools to Old Tools by Name Similarity
  const newToolToCaps = {};
  
  // Helper to find closest original tool
  const findClosestOldTool = (newName) => {
    const lowerNew = newName.toLowerCase();
    for (const old of Object.values(xlsxTools)) {
      const oldName = (old['ToolName'] || old['Tool Name'] || '').toLowerCase();
      if (oldName === lowerNew || oldName.includes(lowerNew) || lowerNew.includes(oldName)) {
        return old.ToolID;
      }
    }
    return null;
  };

  const dbToolDetails = [];
  for (const [tId, t] of Object.entries(dbTools)) {
    const oldId = findClosestOldTool(t.toolName);
    let caps = new Set();
    if (oldId && origToolToCaps[oldId]) {
      caps = origToolToCaps[oldId];
    } else {
      // Fallback heuristics if no match found
      if (t.toolName.includes('Azure AI')) caps = origToolToCaps['AzureAI'] || new Set(['CAP-001', 'CAP-002']);
      else if (t.toolName.includes('Defender')) caps = origToolToCaps['Defender'] || new Set(['CAP-021', 'CAP-022']);
      else if (t.toolName.includes('Zscaler')) caps = origToolToCaps['Zscaler'] || new Set(['CAP-011', 'CAP-012']);
      else if (t.toolName.includes('Cyera')) caps = origToolToCaps['Cyera'] || new Set(['CAP-025', 'CAP-026']);
      else if (t.toolName.includes('Island')) caps = origToolToCaps['IslandBrowser'] || new Set(['CAP-011']);
    }
    
    // Resolve capability names
    const capNames = [];
    for (const capId of caps) {
      const cap = await Capability.findOne({ capabilityId: capId }).lean();
      if (cap) capNames.push(`${capId}: ${cap.capabilityName}`);
      else capNames.push(capId);
    }

    dbToolDetails.push({
      toolId: t.toolId,
      toolName: t.toolName,
      matchedOldId: oldId,
      mappedCaps: capNames.sort()
    });
  }

  // Generate Markdown Artifact content
  let md = `# Tool & Capability Mapping Analysis\n\n`;
  
  md += `## 1. Differences Between MasterSheet and Database Tools\n\n`;
  md += `Your CEO deleted all previous tools in the DB and added **${dbNames.length}** new tools. The MasterSheet originally had **${xlsxNames.length}** tools.\n\n`;
  
  md += `### MasterSheet Original Tools:\n`;
  for (const n of xlsxNames.sort()) md += `- ${n}\n`;
  
  md += `\n### Current Database Tools (Updated by CEO):\n`;
  for (const n of dbNames.sort()) md += `- ${n}\n`;

  md += `\n## 2. Proposed Capability-Tool Mapping\n\n`;
  md += `By looking at which controls the original tools were mapped to, and translating that up to the **Capability level**, here is the proposed mapping for the new tools. \n\n`;
  
  md += `| Tool ID | Tool Name | Mapped Capabilities |\n`;
  md += `|---|---|---|\n`;
  for (const t of dbToolDetails.sort((a,b) => a.toolId.localeCompare(b.toolId))) {
    md += `| ${t.toolId} | ${t.toolName} | ${t.mappedCaps.join('<br>')} |\n`;
  }

  fs.writeFileSync('C:/Users/TayyabSaleem/.gemini/antigravity/brain/160f6fa2-f38d-4d9f-b650-c07baf78aa2e/capability_tool_mapping_plan.md', md);
  console.log('Artifact created successfully.');

  await mongoose.disconnect();
}

main().catch(console.error);
