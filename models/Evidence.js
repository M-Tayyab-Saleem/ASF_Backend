const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema({
  controlId: { type: String, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fileName: { type: String, required: true },
  fileType: { type: String, enum: ['pdf', 'image'], required: true },
  mimeType: { type: String, required: true },
  fileSizeBytes: { type: Number, required: true },
  storagePath: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now }
});

evidenceSchema.index({ controlId: 1 });
evidenceSchema.index({ uploadedBy: 1 });
evidenceSchema.index({ controlId: 1, uploadedBy: 1 });

module.exports = mongoose.model('Evidence', evidenceSchema);
