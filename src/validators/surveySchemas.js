// Input validation schemas
export const validatePhone = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  // Turkish phone format: +90... or 05... or 5...
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  return /^(\+90|0)?5\d{9}$/.test(cleaned);
};

export const validateScore = (score, min, max) => {
  const s = parseInt(score, 10);
  return !isNaN(s) && s >= min && s <= max;
};

export const validateSurveyCreation = (body) => {
  const errors = [];
  
  if (!body.phone) {
    errors.push('phone is required');
  } else if (!validatePhone(body.phone)) {
    errors.push('invalid phone format');
  }
  
  if (body.scoreThreshold !== undefined) {
    if (!validateScore(body.scoreThreshold, 1, 10)) {
      errors.push('scoreThreshold must be between 1 and 10');
    }
  }
  
  if (body.locale && !['tr', 'en'].includes(body.locale)) {
    errors.push('locale must be tr or en');
  }
  
  return { valid: errors.length === 0, errors };
};

export const validateScoreSubmission = (score, min, max) => {
  if (!validateScore(score, min, max)) {
    return { valid: false, error: `score must be ${min}..${max}` };
  }
  return { valid: true };
};

export const validateCategoryKey = (key) => {
  const allowed = ['bek', 'dr', 'ekp', 'bank', 'sln', 'tmz'];
  return allowed.includes(String(key));
};

export const sanitizeComment = (comment) => {
  if (!comment) return '';
  return String(comment).trim().slice(0, 2000);
};
