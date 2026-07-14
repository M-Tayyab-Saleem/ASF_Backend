require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const ControlToolMapping = require('../models/ControlToolMapping');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  const mappings = await ControlToolMapping.find({}).lean();
  
  const pairCounts = {};
  for (const m of mappings) {
    const key = `${m.controlId}||${m.toolId}`;
    pairCounts[key] = (pairCounts[key] || 0) + 1;
  }
  
  const duplicates = Object.entries(pairCounts).filter(([_, count]) => count > 1);
  console.log(`Total Mappings: ${mappings.length}`);
  console.log(`Unique Pairs: ${Object.keys(pairCounts).length}`);
  console.log(`Pairs with duplicates: ${duplicates.length}`);
  
  if (duplicates.length > 0) {
    console.log('Sample duplicates:');
    for (const [key, count] of duplicates.slice(0, 10)) {
      console.log(`  ${key}: ${count} copies`);
    }
  }
  
  await mongoose.disconnect();
}
main().catch(console.error);
