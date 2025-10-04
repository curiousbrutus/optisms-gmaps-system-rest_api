import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SurveyService } from '../src/services/surveyService.js';
import { db } from '../src/db/index.js';

describe('SurveyService', () => {
  let testSurveyId;

  beforeAll(() => {
    // Ensure test database is clean
    db.prepare('DELETE FROM responses').run();
    db.prepare('DELETE FROM surveys').run();
    db.prepare('DELETE FROM contacts').run();
  });

  afterAll(() => {
    // Clean up after tests
    db.prepare('DELETE FROM responses').run();
    db.prepare('DELETE FROM surveys').run();
    db.prepare('DELETE FROM contacts').run();
  });

  describe('createSurvey', () => {
    it('should create a new survey with valid data', () => {
      const result = SurveyService.createSurvey({
        phone: '+905551234567',
        name: 'Test Patient',
        department: 'Cardiology',
        doctor: 'Dr. Smith',
        visitDate: '2025-10-04'
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('url');
      expect(result.url).toContain(result.id);
      
      testSurveyId = result.id;
    });

    it('should reuse existing contact for same phone', () => {
      const result1 = SurveyService.createSurvey({
        phone: '+905559876543',
        name: 'Contact Test'
      });

      const result2 = SurveyService.createSurvey({
        phone: '+905559876543',
        name: 'Contact Test 2'
      });

      const contact1 = db.prepare('SELECT contact_id FROM surveys WHERE id = ?').get(result1.id);
      const contact2 = db.prepare('SELECT contact_id FROM surveys WHERE id = ?').get(result2.id);
      
      expect(contact1.contact_id).toBe(contact2.contact_id);
    });
  });

  describe('submitScore', () => {
    it('should accept valid score (1-10)', () => {
      const result = SurveyService.submitScore(testSurveyId, 9);
      expect(result).toEqual({ ok: true });

      const response = db.prepare(
        "SELECT score FROM responses WHERE survey_id = ? AND step = 'score'"
      ).get(testSurveyId);
      
      expect(response.score).toBe(9);
    });

    it('should reject invalid scores', () => {
      expect(() => SurveyService.submitScore(testSurveyId, 0)).toThrow();
      expect(() => SurveyService.submitScore(testSurveyId, 11)).toThrow();
      expect(() => SurveyService.submitScore(testSurveyId, 'invalid')).toThrow();
    });

    it('should throw error for non-existent survey', () => {
      expect(() => SurveyService.submitScore('nonexistent', 5)).toThrow('Survey not found');
    });
  });

  describe('submitCategory', () => {
    it('should accept valid category scores (1-5)', () => {
      const result = SurveyService.submitCategory(testSurveyId, 'bek', 4);
      expect(result).toEqual({ ok: true });

      const response = db.prepare(
        "SELECT score FROM responses WHERE survey_id = ? AND step = 'bek'"
      ).get(testSurveyId);
      
      expect(response.score).toBe(4);
    });

    it('should reject invalid category scores', () => {
      expect(() => SurveyService.submitCategory(testSurveyId, 'bek', 0)).toThrow();
      expect(() => SurveyService.submitCategory(testSurveyId, 'bek', 6)).toThrow();
    });
  });

  describe('submitNPS', () => {
    it('should accept valid NPS scores (0-10)', () => {
      const result = SurveyService.submitNPS(testSurveyId, 10);
      expect(result).toEqual({ ok: true });

      const response = db.prepare(
        "SELECT score FROM responses WHERE survey_id = ? AND step = 'tav'"
      ).get(testSurveyId);
      
      expect(response.score).toBe(10);
    });
  });

  describe('submitComment', () => {
    it('should save comment', () => {
      const comment = 'Great service!';
      const result = SurveyService.submitComment(testSurveyId, comment);
      expect(result).toEqual({ ok: true });

      const response = db.prepare(
        "SELECT comment FROM responses WHERE survey_id = ? AND step = 'comment'"
      ).get(testSurveyId);
      
      expect(response.comment).toBe(comment);
    });

    it('should truncate long comments', () => {
      const longComment = 'a'.repeat(3000);
      SurveyService.submitComment(testSurveyId, longComment);

      const response = db.prepare(
        "SELECT comment FROM responses WHERE survey_id = ? AND step = 'comment' ORDER BY id DESC LIMIT 1"
      ).get(testSurveyId);
      
      expect(response.comment.length).toBeLessThanOrEqual(2000);
    });
  });

  describe('getSurveyContext', () => {
    it('should return complete survey context', () => {
      const context = SurveyService.getSurveyContext(testSurveyId);
      
      expect(context).toHaveProperty('survey');
      expect(context).toHaveProperty('responses');
      expect(context).toHaveProperty('map');
      expect(context).toHaveProperty('threshold');
      expect(context).toHaveProperty('showGoogle');
    });

    it('should show Google button for high scores', () => {
      const survey = SurveyService.createSurvey({
        phone: '+905551111111',
        name: 'High Score Test'
      });
      
      SurveyService.submitScore(survey.id, 10);
      const context = SurveyService.getSurveyContext(survey.id);
      
      expect(context.showGoogle).toBe(true);
    });

    it('should not show Google button for low scores', () => {
      const survey = SurveyService.createSurvey({
        phone: '+905552222222',
        name: 'Low Score Test'
      });
      
      SurveyService.submitScore(survey.id, 3);
      const context = SurveyService.getSurveyContext(survey.id);
      
      expect(context.showGoogle).toBe(false);
    });
  });

  describe('getAnalytics', () => {
    it('should return comprehensive analytics', () => {
      const analytics = SurveyService.getAnalytics({});
      
      expect(analytics).toHaveProperty('overview');
      expect(analytics).toHaveProperty('trends');
      expect(analytics).toHaveProperty('performance');
      expect(analytics).toHaveProperty('responseRates');
      
      expect(analytics.overview).toHaveProperty('total_surveys');
      expect(analytics.overview).toHaveProperty('avg_score');
      expect(analytics.overview).toHaveProperty('avg_nps');
    });
  });

  describe('exportCSV', () => {
    it('should generate CSV with UTF-8 BOM', () => {
      const csv = SurveyService.exportCSV();
      
      expect(csv).toContain('\uFEFF'); // BOM
      expect(csv).toContain('Tarih');
      expect(csv).toContain('Ad-Soyad');
    });
  });
});
