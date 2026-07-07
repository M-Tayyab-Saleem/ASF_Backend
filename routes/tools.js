const express = require('express');
const router = express.Router();
const toolsController = require('../controllers/toolsController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Public/Read-only
router.get('/', toolsController.getMany);
router.get('/categories', toolsController.getCategories);
router.get('/:id', toolsController.getOne);

// Admin only
router.post('/', requireAuth, requireAdmin, toolsController.createTool);
router.put('/:id', requireAuth, requireAdmin, toolsController.updateTool);
router.patch('/:id/effectiveness', requireAuth, requireAdmin, toolsController.setEffectiveness);

module.exports = router;
