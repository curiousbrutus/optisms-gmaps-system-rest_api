import 'dotenv/config';

const config = {
  // Server
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 8080}`,
  logLevel: process.env.LOG_LEVEL || 'info',

  // Database
  dbPath: process.env.DB_PATH || './data/app.db',

  // Security
  apiKey: process.env.API_KEY?.trim() || null,
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean),
  adminUser: process.env.ADMIN_USER || '',
  adminPass: process.env.ADMIN_PASS || '',

  // Rate Limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '50', 10), // Reduced from 120

  // Survey Settings
  scoreThreshold: parseInt(process.env.SCORE_THRESHOLD || '8', 10),
  googlePlaceUrl: process.env.GOOGLE_PLACE_URL || '',
  brandName: process.env.BRAND_NAME || 'Memnuniyet Anketi',
  googleAutoRedirectSeconds: parseInt(process.env.GOOGLE_AUTO_REDIRECT_SECONDS || '0', 10),
  googleFinalizeOnClick: String(process.env.GOOGLE_FINALIZE_ON_CLICK || 'true').toLowerCase() === 'true',

  // Complaint Notifications
  complaintWebhookUrl: process.env.COMPLAINT_WEBHOOK_URL || '',
  complaintThreshold: parseInt(process.env.COMPLAINT_THRESHOLD || '4', 10),

  // Twilio (optional)
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',

  // Features
  enableCache: String(process.env.ENABLE_CACHE || 'true').toLowerCase() === 'true',
  cacheMaxAge: parseInt(process.env.CACHE_MAX_AGE || '300', 10), // 5 minutes
};

// Validation
export function validateConfig() {
  const errors = [];
  
  if (config.nodeEnv === 'production') {
    if (!config.apiKey) errors.push('API_KEY is required in production');
    if (config.corsOrigins.includes('*')) errors.push('CORS_ORIGINS wildcard (*) not allowed in production');
    if (!config.adminUser || !config.adminPass) errors.push('ADMIN_USER and ADMIN_PASS required in production');
    if (!config.googlePlaceUrl) console.warn('⚠️  GOOGLE_PLACE_URL not set - Google reviews disabled');
  }

  if (errors.length > 0) {
    throw new Error('Configuration validation failed:\n' + errors.join('\n'));
  }
}

export default config;
