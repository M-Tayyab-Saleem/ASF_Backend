require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    const result = await User.deleteMany({});
    console.log(`Deleted ${result.deletedCount} users.`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
