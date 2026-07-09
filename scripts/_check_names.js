require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Control  = require('../models/Control');

mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 }).then(async () => {
  const all = await Control.find({
    controlId: { $in: ['SD-01','SD-02','SD-03','SD-04','SD-05','SD-06','SD-07','SD-08','SD-09','SD-10','SD-11','SD-12'] }
  }).select('controlId controlName strategyId capabilityId').sort({ controlId: 1 }).lean();

  console.log(`Total SD controls in DB: ${all.length}`);
  for (const c of all) {
    const ok = c.strategyId === 'SA' ? '✅' : `❌ strategyId=${c.strategyId}`;
    console.log(`  ${ok}  ${c.controlId}  cap=${c.capabilityId}  "${c.controlName}"`);
  }
  await mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
