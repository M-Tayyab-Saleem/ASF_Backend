const express = require('express');
const router = express.Router();
const controlsController = require('../controllers/controlsController');

router.get('/', controlsController.getMany);
router.get('/:id', controlsController.getOne);

module.exports = router;
