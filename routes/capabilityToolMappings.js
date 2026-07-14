const express = require('express');
const router = express.Router();
const capabilityToolMappingController = require('../controllers/capabilityToolMappingController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ── Protect all routes ────────────────────────────────────────────────────────
router.use(requireAuth);

router.route('/')
  .get(capabilityToolMappingController.getMappings)
  .post(requireAdmin, capabilityToolMappingController.addMapping)
  .delete(requireAdmin, capabilityToolMappingController.removeMappingByToolAndCapability);

router.route('/:id')
  .delete(requireAdmin, capabilityToolMappingController.removeMapping);

module.exports = router;
