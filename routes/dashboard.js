const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/me', requireAuth, dashboardController.getMyDashboard);
router.get('/user/:userId', requireAuth, requireAdmin, dashboardController.getUserDashboard);
router.get('/all', requireAuth, requireAdmin, dashboardController.getAllDashboard);
router.get('/users', requireAuth, requireAdmin, dashboardController.getUsers);

module.exports = router;
