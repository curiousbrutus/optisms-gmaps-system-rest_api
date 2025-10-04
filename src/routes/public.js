import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

// Root redirect to admin panel
router.get('/', (req, res) => {
  res.redirect('/admin');
});

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'sms-review-flow', version: '2.0.0' });
});

// Serve static public assets
router.use('/public', express.static(path.join(projectRoot, 'public')));

// Use static SPA for survey, it will call API to load state
router.get('/s/:surveyId', (req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'survey.html'));
});

export default router;
