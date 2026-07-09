const xlsx = require('../node_modules/xlsx');
const wb = xlsx.readFile('../MasterSheet.xlsx');
const ccmWs = wb.Sheets['CapabilityControlMapping'];
const ccm = xlsx.utils.sheet_to_json(ccmWs);

// SD-01..SD-06 capability mappings
const sdRows = ccm.filter(r => {
  const id = (r['Control ID '] || '').toString().trim();
  return id.match(/^SD-0[1-6]$/);
});
console.log('=== SD-01..06 in CapabilityControlMapping ===');
console.log(JSON.stringify(sdRows, null, 2));

// Also check what strategy owns CAP-097..102, 105,107..110
const capWs = wb.Sheets['Capabilities '];
const caps = xlsx.utils.sheet_to_json(capWs);
const capIds = ['CAP-097','CAP-098','CAP-099','CAP-100','CAP-101','CAP-102','CAP-105','CAP-107','CAP-108','CAP-109','CAP-110'];
const relevant = caps.filter(r => capIds.includes((r['Capability ID '] || '').trim()));
console.log('\n=== Capability → Strategy mappings ===');
for (const c of relevant) {
  console.log(`  ${(c['Capability ID '] || '').trim()}  strategyId=${c['Strategy ID']}  name="${(c['Capability Name '] || '').trim()}"`);
}
