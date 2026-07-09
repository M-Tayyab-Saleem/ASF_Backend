const express = require('express');
const router = express.Router();
const controlsController = require('../controllers/controlsController');
const statusController = require('../controllers/statusController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ── Read routes (public / auth) ───────────────────────────────────────────────
router.get('/suggest-id',         requireAuth, requireAdmin, controlsController.suggestId);
router.get('/summary',                                       controlsController.getControlsSummary);
router.get('/by-category',                                   controlsController.getControlsByCategory);
router.get('/',                                              controlsController.getMany);
router.get('/:id/history',        requireAuth,              controlsController.getLifecycleHistory);
router.get('/:id',                                          controlsController.getOne);

// ── Write routes (Admin only for controls, Any user for notes) ────────────────
router.post('/',                  requireAuth, requireAdmin, controlsController.createControl);
router.put('/:controlId',         requireAuth, requireAdmin, controlsController.updateControl);
router.patch('/:controlId/lifecycle', requireAuth, requireAdmin, controlsController.updateLifecycle);
router.patch('/:controlId/at-risk',   requireAuth, requireAdmin, controlsController.toggleAtRisk);
router.post('/:controlId/notes',      requireAuth,               controlsController.addNote);

// ── Legacy status patch (backward compat — keep until deprecated) ─────────────
router.patch('/:controlId/status', requireAuth, requireAdmin, statusController.updateStatus);

module.exports = router;
