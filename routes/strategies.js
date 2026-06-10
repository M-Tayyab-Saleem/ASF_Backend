const express = require('express');
const router = express.Router();
const strategiesController = require('../controllers/strategiesController');

router.get('/', strategiesController.getAll);
router.get('/:id', strategiesController.getOne);

module.exports = router;
