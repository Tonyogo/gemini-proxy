const express = require('express');
const router = express.Router();
const claudeController = require('../controllers/claudeController');

router.post('/messages', claudeController.handleMessages);

module.exports = router;
