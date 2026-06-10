const express = require('express');
const router = express.Router();
const toolsController = require('../controllers/toolsController');

router.get('/', toolsController.getTools);
router.get('/:id', toolsController.getOne);

module.exports = router;
