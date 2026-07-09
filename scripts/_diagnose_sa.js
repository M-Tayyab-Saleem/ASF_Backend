require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Control    = require('../models/Control');
const Capability = require('../models/Capability');

mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 }).then(async () => {
  console.log('✅  Connected\n');

  // 1. Show all MT-06..MT-11 docs and what strategyId/capabilityId they have
  const mtControls = await Control.find({
    controlId: { $in: ['MT-06','MT-07','MT-08','MT-09','MT-10','MT-11'] }
  }).select('controlId controlName strategyId capabilityId').sort({ controlId: 1 }).lean();

  console.log('=== MT controls in DB ===');
  for (const c of mtControls) {
    console.log(`  ${c.controlId}  strategyId=${c.strategyId}  capabilityId=${c.capabilityId}  name="${c.controlName}"`);
  }

  // 2. Show CAP-097..CAP-102 and what strategyId they have
  const saCaps = await Capability.find({
    capabilityId: { $in: ['CAP-097','CAP-098','CAP-099','CAP-100','CAP-101','CAP-102'] }
  }).select('capabilityId capabilityName strategyId controlCount').sort({ capabilityId: 1 }).lean();

  console.log('\n=== SA Capabilities CAP-097..102 ===');
  for (const c of saCaps) {
    console.log(`  ${c.capabilityId}  strategyId=${c.strategyId}  controlCount=${c.controlCount}  name="${c.capabilityName}"`);
  }

  // 3. Count ALL controls under SA strategy
  const saControls = await Control.find({ strategyId: 'SA' })
    .select('controlId controlName capabilityId').sort({ controlId: 1 }).lean();
  console.log('\n=== All controls with strategyId=SA ===');
  for (const c of saControls) {
    console.log(`  ${c.controlId}  cap=${c.capabilityId}  name="${c.controlName}"`);
  }

  await mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
