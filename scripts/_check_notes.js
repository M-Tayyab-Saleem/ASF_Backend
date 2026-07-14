require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;
  const controls = await db.collection('controls').find({ controlId: { $in: ['SD-10', 'SD-11', 'SD-12'] } }).toArray();
  for (const c of controls) {
    console.log(c.controlId, 'notes type:', typeof c.notes, 'is array?', Array.isArray(c.notes), 'value:', c.notes);
  }
  await mongoose.disconnect();
}).catch(console.error);
