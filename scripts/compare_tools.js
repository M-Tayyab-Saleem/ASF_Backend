require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const path = require('path');
const Tool = require('../models/Tool');

const XLSX_PATH = path.resolve(__dirname, '../../MasterSheet.xlsx');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  
  // 1. Get Tools from MasterSheet
  const wb = xlsx.readFile(XLSX_PATH);
  const xlsxToolsData = xlsx.utils.sheet_to_json(wb.Sheets['Tools']);
  const xlsxTools = {};
  for (const r of xlsxToolsData) {
    const id = (r['Tool ID'] || r['Tool ID '] || '').toString().trim();
    if (id) {
      xlsxTools[id] = r;
    }
  }

  // 2. Get Tools from DB
  const dbToolsData = await Tool.find({}).lean();
  const dbTools = {};
  for (const t of dbToolsData) {
    if (t.toolId) {
      dbTools[t.toolId] = t;
    }
  }

  // 3. Compare
  const xlsxIds = new Set(Object.keys(xlsxTools));
  const dbIds = new Set(Object.keys(dbTools));

  const missingInDb = [...xlsxIds].filter(id => !dbIds.has(id));
  const newInDb = [...dbIds].filter(id => !xlsxIds.has(id));
  
  const modifiedInDb = [];
  for (const id of dbIds) {
    if (xlsxIds.has(id)) {
      const dbTool = dbTools[id];
      const xlsxTool = xlsxTools[id];
      const dbName = (dbTool.toolName || '').toString().trim();
      const xlsxName = (xlsxTool['Tool Name'] || xlsxTool['Tool Name '] || '').toString().trim();
      
      if (dbName.toLowerCase() !== xlsxName.toLowerCase()) {
         modifiedInDb.push({ id, oldName: xlsxName, newName: dbName });
      }
    }
  }

  const result = {
    totalXlsxTools: xlsxIds.size,
    totalDbTools: dbIds.size,
    missingInDb: missingInDb.map(id => ({ id, name: xlsxTools[id]['Tool Name'] || xlsxTools[id]['Tool Name '] })),
    newInDb: newInDb.map(id => ({ id, name: dbTools[id].toolName })),
    modifiedInDb
  };

  console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
}

main().catch(console.error);
