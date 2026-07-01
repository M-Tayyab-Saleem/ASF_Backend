const express = require('express');
const router = express.Router();
const evidenceController = require('../controllers/evidenceController');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { upload, uploadErrorHandler } = require('../middleware/upload');

router.post('/:controlId', requireAuth, upload.single('file'), uploadErrorHandler, evidenceController.uploadEvidence);
router.get('/:controlId', requireAuth, evidenceController.listEvidence);
router.get('/:controlId/:evidenceId/download', requireAuth, evidenceController.downloadEvidence);
router.delete('/:evidenceId', requireAuth, requireAdmin, evidenceController.deleteEvidence);

module.exports = router;
