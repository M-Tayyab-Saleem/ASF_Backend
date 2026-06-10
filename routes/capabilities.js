const express = require('express');
const router = express.Router();
const capabilitiesController = require('../controllers/capabilitiesController');

router.get('/', capabilitiesController.getByStrategy);
router.get('/:id', capabilitiesController.getOne);

module.exports = router;
