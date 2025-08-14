import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import pinoHttp from 'pino-http';
import publicRoutes from './routes/public.js';
import apiRoutes from './routes/api.js';
import vendorRoutes from './routes/vendor.js';

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Configurable CORS
const allowOrigins = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const corsOptions = allowOrigins.includes('*')
  ? { origin: true, credentials: false }
  : { origin: function(origin, callback){
      if (!origin || allowOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    }
    };

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(pinoHttp({ logger }));

// Optional API key auth for /api endpoints
const apiKey = process.env.API_KEY && String(process.env.API_KEY).trim();
function apiKeyAuth(req, res, next) {
  if (!apiKey) return next(); // disabled if no key
  const h = req.get('authorization') || '';
  const viaAuth = h.toLowerCase().startsWith('bearer ') && h.slice(7).trim() === apiKey;
  const viaHeader = req.get('x-api-key') && req.get('x-api-key') === apiKey;
  if (viaAuth || viaHeader) return next();
  res.status(401).json({ error: 'unauthorized' });
}

// Rate limiter for API (configurable)
const rlWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const rlMax = Number(process.env.RATE_LIMIT_MAX || 120);
const apiLimiter = rateLimit({ windowMs: rlWindowMs, max: rlMax, standardHeaders: true, legacyHeaders: false });

app.use('/', publicRoutes);
app.use('/api', apiLimiter, apiKeyAuth, apiRoutes);
app.use('/api', apiLimiter, apiKeyAuth, vendorRoutes);

const port = process.env.PORT || 8080;
app.listen(port, () => {
  logger.info(`sms-review-flow listening on http://localhost:${port}`);
});
