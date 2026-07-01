const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.patch('/:userId/role', requireAuth, requireAdmin, userController.updateUserRole);

module.exports = router;
