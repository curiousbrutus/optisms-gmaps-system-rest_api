import { describe, it, expect } from 'vitest';
import {
  validatePhone,
  validateScore,
  validateSurveyCreation,
  validateCategoryKey,
  sanitizeComment
} from '../src/validators/surveySchemas.js';

describe('Validators', () => {
  describe('validatePhone', () => {
    it('should accept valid Turkish phone numbers', () => {
      expect(validatePhone('+905551234567')).toBe(true);
      expect(validatePhone('05551234567')).toBe(true);
      expect(validatePhone('5551234567')).toBe(true);
      expect(validatePhone('+90 555 123 45 67')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(validatePhone('123')).toBe(false);
      expect(validatePhone('+1234567890')).toBe(false);
      expect(validatePhone('invalid')).toBe(false);
      expect(validatePhone('')).toBe(false);
      expect(validatePhone(null)).toBe(false);
    });
  });

  describe('validateScore', () => {
    it('should validate scores within range', () => {
      expect(validateScore(5, 1, 10)).toBe(true);
      expect(validateScore(1, 1, 10)).toBe(true);
      expect(validateScore(10, 1, 10)).toBe(true);
    });

    it('should reject scores outside range', () => {
      expect(validateScore(0, 1, 10)).toBe(false);
      expect(validateScore(11, 1, 10)).toBe(false);
      expect(validateScore('abc', 1, 10)).toBe(false);
    });
  });

  describe('validateSurveyCreation', () => {
    it('should validate correct survey data', () => {
      const result = validateSurveyCreation({
        phone: '+905551234567',
        name: 'Test',
        locale: 'tr'
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing phone', () => {
      const result = validateSurveyCreation({
        name: 'Test'
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('phone is required');
    });

    it('should reject invalid phone format', () => {
      const result = validateSurveyCreation({
        phone: 'invalid'
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('invalid phone format');
    });

    it('should reject invalid locale', () => {
      const result = validateSurveyCreation({
        phone: '+905551234567',
        locale: 'fr'
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('locale must be tr or en');
    });
  });

  describe('validateCategoryKey', () => {
    it('should accept valid category keys', () => {
      expect(validateCategoryKey('bek')).toBe(true);
      expect(validateCategoryKey('dr')).toBe(true);
      expect(validateCategoryKey('ekp')).toBe(true);
      expect(validateCategoryKey('bank')).toBe(true);
      expect(validateCategoryKey('sln')).toBe(true);
      expect(validateCategoryKey('tmz')).toBe(true);
    });

    it('should reject invalid category keys', () => {
      expect(validateCategoryKey('invalid')).toBe(false);
      expect(validateCategoryKey('')).toBe(false);
      expect(validateCategoryKey(null)).toBe(false);
    });
  });

  describe('sanitizeComment', () => {
    it('should trim and limit comment length', () => {
      const longComment = 'a'.repeat(3000);
      const sanitized = sanitizeComment(longComment);
      
      expect(sanitized.length).toBe(2000);
    });

    it('should handle empty comments', () => {
      expect(sanitizeComment('')).toBe('');
      expect(sanitizeComment(null)).toBe('');
      expect(sanitizeComment(undefined)).toBe('');
    });

    it('should trim whitespace', () => {
      expect(sanitizeComment('  test  ')).toBe('test');
    });
  });
});
