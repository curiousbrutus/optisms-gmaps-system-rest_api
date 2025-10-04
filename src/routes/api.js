import express from 'express';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { SurveyService } from '../services/surveyService.js';
import { validateSurveyCreation, validateScoreSubmission, validateCategoryKey, sanitizeComment } from '../validators/surveySchemas.js';
import { AppError } from '../middlewares/errorHandler.js';

const router = express.Router();

// Fetch survey state for the static client
router.get('/survey/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const context = SurveyService.getSurveyContext(id);
  res.json(context);
}));

// Track: user clicked the Google button
router.post('/survey/:id/google-click', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = SurveyService.trackGoogleClick(id);
  res.json(result);
}));

// Track: user auto-redirected to Google
router.post('/survey/:id/google-redirect', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = SurveyService.trackGoogleRedirect(id);
  res.json(result);
}));

// Create a survey link with optional metadata
router.post('/survey', asyncHandler(async (req, res) => {
  const { phone, name, locale = 'tr', scoreThreshold, patientId, department, doctor, visitDate } = req.body;
  
  // Validate input
  const validation = validateSurveyCreation(req.body);
  if (!validation.valid) {
    throw new AppError(validation.errors.join(', '), 400);
  }

  const result = SurveyService.createSurvey({
    phone,
    name,
    locale,
    scoreThreshold,
    patientId,
    department,
    doctor,
    visitDate
  });
  
  res.status(201).json(result);
}));

// General score 1..10
router.post('/survey/:id/score', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { score } = req.body;
  
  const validation = validateScoreSubmission(score, 1, 10);
  if (!validation.valid) {
    throw new AppError(validation.error, 400);
  }

  const result = SurveyService.submitScore(id, score);
  res.json(result);
}));

// Category scores 1..5 for Bek, Dr, Ekp, Bank, Sln, Tmz
router.post('/survey/:id/category', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { key, score } = req.body;
  
  if (!validateCategoryKey(key)) {
    throw new AppError('Invalid category key', 400);
  }
  
  const validation = validateScoreSubmission(score, 1, 5);
  if (!validation.valid) {
    throw new AppError(validation.error, 400);
  }

  const result = SurveyService.submitCategory(id, key, score);
  res.json(result);
}));

// NPS-like Tav 0..10
router.post('/survey/:id/tav', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { score } = req.body;
  
  const validation = validateScoreSubmission(score, 0, 10);
  if (!validation.valid) {
    throw new AppError(validation.error, 400);
  }

  const result = SurveyService.submitNPS(id, score);
  res.json(result);
}));

router.post('/survey/:id/comment', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  
  const sanitized = sanitizeComment(comment);
  const result = SurveyService.submitComment(id, sanitized);
  res.json(result);
}));

router.post('/survey/:id/finalize', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status = 'completed' } = req.body;
  
  const result = SurveyService.finalizeSurvey(id, status);
  res.json(result);
}));

// CSV export
router.get('/export/csv', asyncHandler(async (req, res) => {
  const csv = SurveyService.exportCSV();
  
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="anket_export.csv"');
  res.send(csv);
}));

export default router;
