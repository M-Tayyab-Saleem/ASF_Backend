const Evidence = require('../models/Evidence');
const Control = require('../models/Control');
const path = require('path');
const fs = require('fs');
const { sanitizeFileName } = require('../middleware/upload');

exports.uploadEvidence = async (req, res) => {
  try {
    const { controlId } = req.params;

    const control = await Control.findOne({ controlId });
    if (!control) {
      return res.status(404).json({ success: false, error: 'Control not found', code: 'NOT_FOUND' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded', code: 'VALIDATION_ERROR' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const fileType = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? 'image' : 'pdf';

    const evidence = await Evidence.create({
      controlId,
      uploadedBy: req.user._id,
      fileName: sanitizeFileName(req.file.originalname),
      fileType,
      mimeType: req.file.mimetype,
      fileSizeBytes: req.file.size,
      storagePath: req.file.path
    });

    const populated = await Evidence.findById(evidence._id).populate('uploadedBy', 'fullName email');

    res.status(201).json({
      success: true,
      data: populated
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.listEvidence = async (req, res) => {
  try {
    const { controlId } = req.params;

    const control = await Control.findOne({ controlId });
    if (!control) {
      return res.status(404).json({ success: false, error: 'Control not found', code: 'NOT_FOUND' });
    }

    let query = { controlId };
    if (req.user.role !== 'admin') {
      query.uploadedBy = req.user._id;
    }

    const evidence = await Evidence.find(query)
      .populate('uploadedBy', 'fullName email')
      .sort({ uploadedAt: -1 });

    res.json({
      success: true,
      data: evidence,
      meta: { count: evidence.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.downloadEvidence = async (req, res) => {
  try {
    const { controlId, evidenceId } = req.params;

    const evidence = await Evidence.findById(evidenceId);
    if (!evidence) {
      return res.status(404).json({ success: false, error: 'Evidence not found', code: 'NOT_FOUND' });
    }

    if (evidence.controlId !== controlId) {
      return res.status(404).json({ success: false, error: 'Evidence not found for this control', code: 'NOT_FOUND' });
    }

    if (req.user.role !== 'admin' && evidence.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
    }

    if (!fs.existsSync(evidence.storagePath)) {
      return res.status(404).json({ success: false, error: 'File not found on disk', code: 'FILE_NOT_FOUND' });
    }

    res.download(evidence.storagePath, evidence.fileName);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

exports.deleteEvidence = async (req, res) => {
  try {
    const evidence = await Evidence.findById(req.params.evidenceId);
    if (!evidence) {
      return res.status(404).json({ success: false, error: 'Evidence not found', code: 'NOT_FOUND' });
    }

    if (fs.existsSync(evidence.storagePath)) {
      fs.unlinkSync(evidence.storagePath);
    }

    await Evidence.findByIdAndDelete(req.params.evidenceId);

    res.json({ success: true, data: { message: 'Evidence deleted' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};
