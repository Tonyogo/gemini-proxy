const express = require('express');
const router = Router = express.Router();
const claudeController = require('../controllers/claudeController');

router.post('/messages', claudeController.handleMessages);
router.post('/messages/count_tokens', claudeController.handleCountTokens);

module.exports = router;
