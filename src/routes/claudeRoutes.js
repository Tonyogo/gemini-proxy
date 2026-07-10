const express = require('express');
const router = express.Router();
const claudeController = require('../controllers/claudeController');

router.post('/messages', (req, res) => claudeController.handleMessages(req, res));
router.post('/messages/count_tokens', (req, res) => claudeController.handleCountTokens(req, res));

router.get('/models', (req, res) => claudeController.handleListModels(req, res));
router.get('/models/:model_id', (req, res) => claudeController.handleRetrieveModel(req, res));

module.exports = router;
