require('dotenv').config();
const express = require('express');
const { runNewsDistillation } = require('./distillNewsSkill');

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.post('/run-task', async (req, res) => {
  console.log('[SERVER] /run-task triggered');
  try {
    const result = await runNewsDistillation();
    res.status(200).json({ status: 'success', result });
  } catch (error) {
    console.error('[SERVER] Error during task execution:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.listen(port, () => {
  console.log(`[SERVER] Listening on port ${port}`);
});
