require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const ControlToolMapping = require('../models/ControlToolMapping');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  const mappings = await ControlToolMapping.find({}).lean();
  
  const byPair = {};
  for (const m of mappings) {
    const key = `${m.controlId}||${m.toolId}`;
    if (!byPair[key]) byPair[key] = [];
    byPair[key].push(m._id);
  }
  
  let deletedCount = 0;
  for (const [key, ids] of Object.entries(byPair)) {
    if (ids.length > 1) {
      // Keep the first one, delete the rest
      const toDelete = ids.slice(1);
      await ControlToolMapping.deleteMany({ _id: { $in: toDelete } });
      deletedCount += toDelete.length;
      console.log(`Removed ${toDelete.length} duplicates for ${key.replace('||', ' ↔ ')}`);
    }
  }
  
  console.log(`\n✅ Cleaned up ${deletedCount} duplicate mappings.`);
  await mongoose.disconnect();
}
main().catch(console.error);
