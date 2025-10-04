import express from 'express';
import { adminBasicAuth } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { SurveyService } from '../services/surveyService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

// Admin panel (static HTML) - Enhanced v2.0 with Analytics
router.get('/admin', adminBasicAuth, (req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'admin-v2.html'));
});

// Admin API: List surveys with filters
router.get('/admin/api/surveys', adminBasicAuth, asyncHandler(async (req, res) => {
  const { from, to, q, status, limit, offset } = req.query;
  const result = SurveyService.getAdminSurveys({ from, to, q, status, limit, offset });
  res.json(result);
}));

// Admin API: Get analytics
router.get('/admin/api/analytics', adminBasicAuth, asyncHandler(async (req, res) => {
  const { from, to, status } = req.query;
  const analytics = SurveyService.getAnalytics({ from, to, status });
  res.json(analytics);
}));

export default router;
