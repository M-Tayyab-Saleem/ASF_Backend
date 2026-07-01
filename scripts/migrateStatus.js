const mongoose = require('mongoose');
require('dotenv').config();

const Control = require('../models/Control');

async function migrateStatus() {
  await mongoose.connect(process.env.MONGODB_URI);

  const result = await Control.updateMany(
    { $or: [{ status: null }, { status: { $exists: false } }] },
    { $set: { status: 'Pending' } }
  );

  console.log(`Migration complete. Updated ${result.modifiedCount} controls to "Pending".`);
  process.exit(0);
}

migrateStatus().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
