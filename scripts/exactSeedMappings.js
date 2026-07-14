const mongoose = require('mongoose');
const xlsx = require('xlsx');
const path = require('path');
const Tool = require('../models/Tool');
const Capability = require('../models/Capability');
const CapabilityToolMapping = require('../models/CapabilityToolMapping');
require('dotenv').config();

// Simple heuristic mapping to map current DB tools to the original MasterSheet tool names
const dbToolToMasterSheetTool = {
  "Akamai": "Akamai WAF",
  "Cranium": "Cranium",
  "Cyera": "Cyera", // Cyera wasn't explicitly in original master sheet tools list originally, but maybe it was? Let's check below.
  "Island Enterprise Browser": "Island Browser",
  "Microsoft Azure AI / Azure AI Foundry": "Azure AI Foundry",
  "Microsoft Defender XDR": "Microsoft Defender",
  "Microsoft Entra ID": "Microsoft Entra",
  "Microsoft Intune": "Microsoft Intune",
  "Microsoft Purview": "Microsoft Purview",
  "Microsoft Sentinel": "Microsoft Sentinel",
  "Portal26": "Prisma Cloud Portal 26",
  "Reco": "Reco",
  "Robocorp": "Robocorp",
  "Wiz": "Wiz",
  "Zscaler Internet Access": "Zscaler"
};

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // 1. Read MasterSheet
    const excelPath = path.join(__dirname, '../../MasterSheet.xlsx');
    console.log(`Reading MasterSheet from: ${excelPath}`);
    const workbook = xlsx.readFile(excelPath);
    
    // Parse Tools: ToolID -> ToolName
    const toolsSheet = workbook.Sheets['Tools'];
    const toolsData = xlsx.utils.sheet_to_json(toolsSheet);
    const toolIdToName = {};
    toolsData.forEach(row => {
      const id = (row['ToolID'] || '').toString().trim();
      const name = (row['ToolName'] || '').toString().trim();
      if(id) toolIdToName[id] = name;
    });

    // Parse CapabilityControlMapping: ControlID -> [CapabilityIDs]
    const capCtrlSheet = workbook.Sheets['CapabilityControlMapping'];
    const capCtrlData = xlsx.utils.sheet_to_json(capCtrlSheet);
    const controlToCaps = {};
    capCtrlData.forEach(row => {
      const ctrlId = (row['Control ID '] || row['Control ID'] || row['ControlID'] || '').toString().trim();
      const capId = (row['Capability ID'] || row['CapabilityID'] || '').toString().trim();
      if(ctrlId && capId) {
        if(!controlToCaps[ctrlId]) controlToCaps[ctrlId] = new Set();
        controlToCaps[ctrlId].add(capId);
      }
    });

    // Parse ToolControlMap : ToolID -> ControlID
    const toolControlSheet = workbook.Sheets['ToolControlMap '];
    const toolControlData = xlsx.utils.sheet_to_json(toolControlSheet);

    const masterToolToCaps = {};
    toolControlData.forEach(row => {
      const toolId = (row['ToolID'] || '').toString().trim();
      const ctrlId = (row['ControlID'] || '').toString().trim();
      
      if (toolId && ctrlId) {
        const toolName = toolIdToName[toolId];
        if (toolName) {
          const capIds = controlToCaps[ctrlId] || [];
          capIds.forEach(capId => {
            if (!masterToolToCaps[toolName]) masterToolToCaps[toolName] = new Set();
            masterToolToCaps[toolName].add(capId);
          });
        }
      }
    });

    // 2. Clear Existing Mappings
    console.log('Clearing existing CapabilityToolMappings...');
    await CapabilityToolMapping.deleteMany({});
    
    // Also clear the `linkedTools` array on Capabilities
    await Capability.updateMany({}, { $set: { linkedTools: [] } });

    // 3. Map new Tools
    const dbTools = await Tool.find();
    const dbCapabilities = await Capability.find();

    const capByCapId = {};
    dbCapabilities.forEach(c => {
      capByCapId[c.capabilityId] = c;
    });

    let count = 0;

    for (const tool of dbTools) {
      const dbToolName = tool.name || tool.toolName;
      const masterToolName = dbToolToMasterSheetTool[dbToolName] || dbToolName;
      
      const targetCaps = masterToolToCaps[masterToolName];
      if (!targetCaps) {
        console.log(`No mapping found in MasterSheet for tool: ${dbToolName} (Master name: ${masterToolName})`);
        continue;
      }

      console.log(`Mapping ${dbToolName} -> ${targetCaps.size} capabilities`);
      
      for (const capId of targetCaps) {
        const capability = capByCapId[capId];
        if (!capability) {
          console.log(`  Warning: Capability ${capId} not found in DB`);
          continue;
        }

        await CapabilityToolMapping.create({
          toolId: tool._id,
          capabilityId: capability._id,
          description: `Exact seed from MasterSheet for ${dbToolName} -> ${capId}`,
          verified: true
        });

        if (!capability.linkedTools) capability.linkedTools = [];
        if (!capability.linkedTools.includes(tool._id)) {
          capability.linkedTools.push(tool._id);
          await capability.save();
        }
        count++;
      }
    }

    console.log(`Successfully created ${count} EXACT capability-tool mappings!`);
    process.exit(0);
  } catch (error) {
    console.error('Seed Error:', error);
    process.exit(1);
  }
}

seed();
