const express = require('express');
const router = express.Router();
const ownersController = require('../controllers/ownersController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Public/Read-only
router.get('/', requireAuth, ownersController.getOwners);
router.get('/:id', requireAuth, ownersController.getOwner);

// Admin only
router.post('/', requireAuth, requireAdmin, ownersController.createOwner);
router.put('/:id', requireAuth, requireAdmin, ownersController.updateOwner);
router.delete('/:id', requireAuth, requireAdmin, ownersController.deleteOwner);

module.exports = router;
