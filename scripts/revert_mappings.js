require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const ControlToolMapping = require('../models/ControlToolMapping');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  
  // Find all mappings created in the last 2 hours based on ObjectId timestamp
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  
  const mappings = await ControlToolMapping.find({}).lean();
  let toRevert = [];
  
  for (const m of mappings) {
    if (m._id.getTimestamp() > twoHoursAgo) {
      toRevert.push(m);
    }
  }
  
  console.log(`Found ${toRevert.length} mappings inserted recently (by the other agent).`);
  if (toRevert.length > 0) {
    for (const m of toRevert.slice(0, 10)) {
      console.log(`  To revert: ${m.controlId} ↔ ${m.toolId} (inserted ${m._id.getTimestamp()})`);
    }
    if (toRevert.length > 10) console.log(`  ... and ${toRevert.length - 10} more`);
    
    const idsToDelete = toRevert.map(m => m._id);
    await ControlToolMapping.deleteMany({ _id: { $in: idsToDelete } });
    console.log(`\n✅ REVERTED! Deleted ${idsToDelete.length} mappings that were mistakenly inserted.`);
  } else {
    console.log(`\n⚠️ No recently inserted mappings found.`);
  }
  
  await mongoose.disconnect();
}
main().catch(console.error);
