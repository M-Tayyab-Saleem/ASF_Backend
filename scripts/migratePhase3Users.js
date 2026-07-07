/**
 * Phase 3 — User Migration Script
 * Ensures all existing users that were previously verified (isVerified: true)
 * are migrated to the new status field (status: 'active').
 *
 * Safe to run multiple times (idempotent).
 * Usage: node scripts/migratePhase3Users.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const db = mongoose.connection.db;
  const users = db.collection('users');

  // Set status='active' for any user that was previously isVerified=true
  // and does not yet have a status field set
  const result = await users.updateMany(
    { $or: [{ isVerified: true }, { status: { $exists: false } }] },
    { $set: { status: 'active' }, $unset: { isVerified: '', otp: '', otpExpires: '' } }
  );

  console.log(`Migrated ${result.modifiedCount} user(s) → status: 'active'`);

  // Any user that was isVerified=false (pending OTP) → set status='pending'
  const pendingResult = await users.updateMany(
    { isVerified: false, status: { $exists: false } },
    { $set: { status: 'pending' }, $unset: { isVerified: '', otp: '', otpExpires: '' } }
  );
  console.log(`Marked ${pendingResult.modifiedCount} unverified user(s) → status: 'pending'`);

  await mongoose.disconnect();
  console.log('Done. Migration complete.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
