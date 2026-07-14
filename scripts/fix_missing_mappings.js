const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const xlsx = require('xlsx');

const ControlToolMapping = require('../models/ControlToolMapping');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const workbook = xlsx.readFile(path.resolve(__dirname, '../../MasterSheet.xlsx'));
  const toolMapSheet = xlsx.utils.sheet_to_json(workbook.Sheets['ToolControlMap ']);
  const dbMappings = await ControlToolMapping.find({}).lean();
  const dbMappingSet = new Set(dbMappings.map(m => `${m.controlId}_${m.toolId}`));
  
  let inserted = 0;
  for (const row of toolMapSheet) {
    const ctrlId = row['ControlID'];
    const toolId = row['ToolID'];
    if (!dbMappingSet.has(`${ctrlId}_${toolId}`)) {
      await ControlToolMapping.create({ controlId: ctrlId, toolId: toolId });
      inserted++;
    }
  }
  console.log(`Inserted ${inserted} missing ControlToolMappings`);

  process.exit(0);
}

run().catch(console.error);
