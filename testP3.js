const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/security_framework')
  .then(async () => {
    const Control = require('./models/Control');
    const Phase3ToolControlMapping = require('./models/Phase3ToolControlMapping');
    const Tool = require('./models/Tool');
    
    const mapping = await Phase3ToolControlMapping.findOne({});
    if (!mapping) {
        console.log('No mapping found');
        return process.exit(0);
    }
    const control = await Control.findById(mapping.controlId).lean();
    if (!control) {
        console.log('No control found');
        return process.exit(0);
    }
    
    console.log('controlId:', control.controlId, control._id);
    const p3Mappings = await Phase3ToolControlMapping.find({ controlId: control._id });
    console.log('p3Mappings length:', p3Mappings.length);
    
    const p3ToolIds = p3Mappings.map(m => m.toolId);
    const p3Tools = await Tool.find({ _id: { $in: p3ToolIds } }).lean();
    console.log('p3Tools length:', p3Tools.length);
    console.log('p3Tools:', p3Tools.map(t => t.name || t.toolName));
    
    process.exit(0);
  })
  .catch(console.error);
