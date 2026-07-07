const express = require('express');
const router = express.Router();
const toolMappingController = require('../controllers/toolMappingController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Read-only
router.get('/', requireAuth, toolMappingController.getMappings);

// Admin only
router.post('/', requireAuth, requireAdmin, toolMappingController.addMapping);
router.delete('/:id', requireAuth, requireAdmin, toolMappingController.removeMapping);

module.exports = router;
