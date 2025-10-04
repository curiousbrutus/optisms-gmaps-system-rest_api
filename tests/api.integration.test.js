import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';

describe('API Integration Tests', () => {
  let surveyId;

  describe('POST /api/survey', () => {
    it('should create a new survey', async () => {
      const response = await request(app)
        .post('/api/survey')
        .send({
          phone: '+905551234567',
          name: 'Integration Test',
          department: 'Cardiology',
          doctor: 'Dr. Test'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('url');
      
      surveyId = response.body.id;
    });

    it('should reject invalid phone number', async () => {
      const response = await request(app)
        .post('/api/survey')
        .send({
          phone: 'invalid',
          name: 'Test'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/survey/:id', () => {
    it('should get survey context', async () => {
      const response = await request(app)
        .get(`/api/survey/${surveyId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('survey');
      expect(response.body).toHaveProperty('threshold');
    });

    it('should return 404 for non-existent survey', async () => {
      const response = await request(app)
        .get('/api/survey/nonexistent');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/survey/:id/score', () => {
    it('should submit valid score', async () => {
      const response = await request(app)
        .post(`/api/survey/${surveyId}/score`)
        .send({ score: 9 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });

    it('should reject invalid score', async () => {
      const response = await request(app)
        .post(`/api/survey/${surveyId}/score`)
        .send({ score: 11 });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/survey/:id/category', () => {
    it('should submit valid category score', async () => {
      const response = await request(app)
        .post(`/api/survey/${surveyId}/category`)
        .send({ key: 'bek', score: 4 });

      expect(response.status).toBe(200);
    });

    it('should reject invalid category key', async () => {
      const response = await request(app)
        .post(`/api/survey/${surveyId}/category`)
        .send({ key: 'invalid', score: 4 });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('service');
    });
  });

  describe('GET /api/export/csv', () => {
    it('should export CSV', async () => {
      const response = await request(app)
        .get('/api/export/csv');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('\uFEFF'); // BOM
    });
  });
});
