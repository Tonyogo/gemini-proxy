const express = require('express');
const app = express();
const claudeRoutes = require('./routes/claudeRoutes');

app.use(express.json({ limit: '50mb' }));

app.use('/v1', claudeRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

module.exports = app;
