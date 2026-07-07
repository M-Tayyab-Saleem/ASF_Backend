const express = require('express');
const router = express.Router();
const inviteController = require('../controllers/inviteController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Public routes (no auth required — invitee has no account yet)
router.get('/:token',         inviteController.validateToken);
router.post('/:token/accept', inviteController.acceptInvite);

// Admin-only routes
router.post('/',              requireAuth, requireAdmin, inviteController.createInvite);
router.get('/',               requireAuth, requireAdmin, inviteController.listInvites);
router.post('/:token/resend', requireAuth, requireAdmin, inviteController.resendInvite);
router.delete('/:id',         requireAuth, requireAdmin, inviteController.revokeInvite);

module.exports = router;
