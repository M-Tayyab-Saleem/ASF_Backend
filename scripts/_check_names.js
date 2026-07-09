require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const Control = require('../models/Control');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const controls = await Control.find({
    controlId: { $in: ['SD-01','SD-02','SD-03','SD-04','SD-05','SD-06'] }
  }).select('controlId controlName title').lean();
  
  controls.sort((a,b) => a.controlId.localeCompare(b.controlId));
  console.log('DB current values:');
  for (const c of controls) {
    console.log(`${c.controlId}  controlName: "${c.controlName}"  |  title: "${c.title}"`);
  }
  await mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
