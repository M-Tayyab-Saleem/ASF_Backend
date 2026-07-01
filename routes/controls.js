const express = require('express');
const router = express.Router();
const controlsController = require('../controllers/controlsController');
const statusController = require('../controllers/statusController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/', controlsController.getMany);
router.get('/:id', controlsController.getOne);
router.patch('/:controlId/status', requireAuth, requireAdmin, statusController.updateStatus);

module.exports = router;
