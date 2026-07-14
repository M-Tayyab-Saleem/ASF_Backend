require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const xlsx = require('xlsx');
const path = require('path');

const XLSX_PATH = path.resolve(__dirname, '../../MasterSheet.xlsx');
const wb = xlsx.readFile(XLSX_PATH);
const xlsxToolsData = xlsx.utils.sheet_to_json(wb.Sheets['Tools']);
console.log('Total rows in Tools sheet:', xlsxToolsData.length);
if (xlsxToolsData.length > 0) {
  console.log('First row keys:', Object.keys(xlsxToolsData[0]));
}
