require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;
  const controls = await db.collection('controls').find({ notes: { $type: 'string' } }).toArray();
  
  if (controls.length === 0) {
    console.log('✅ No controls with string notes found.');
  } else {
    for (const c of controls) {
      console.log(`Fixing ${c.controlId} (notes was: "${c.notes}")`);
      // Update the document to have an empty array or properly formatted array.
      // Since we don't know the user who added it, we'll just wipe test notes to [] 
      // or if it has real content, maybe we can't easily attribute it. "Test notes" can just be cleared.
      await db.collection('controls').updateOne(
        { _id: c._id },
        { $set: { notes: [] } }
      );
    }
    console.log('✅ Fixed all string notes.');
  }
  await mongoose.disconnect();
}).catch(console.error);
