require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Control = require('../models/Control');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  const controls = await Control.find({}).lean();
  
  let dupesLinkedTools = 0;
  for (const c of controls) {
    if (!c.linkedTools || c.linkedTools.length === 0) continue;
    const unique = new Set(c.linkedTools.map(id => id.toString()));
    if (unique.size !== c.linkedTools.length) {
      dupesLinkedTools++;
      console.log(`Control ${c.controlId} has duplicate linkedTools: ${c.linkedTools.length} vs ${unique.size}`);
    }
  }
  
  console.log(`Total controls with duplicate linkedTools: ${dupesLinkedTools}`);
  await mongoose.disconnect();
}
main().catch(console.error);
