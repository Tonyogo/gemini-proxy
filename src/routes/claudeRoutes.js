const express = require('express');
const router = express.Router();
const claudeController = require('../controllers/claudeController');

router.post('/messages', (req, res) => claudeController.handleMessages(req, res));
router.post('/messages/count_tokens', (req, res) => claudeController.handleCountTokens(req, res));

module.exports = router;
