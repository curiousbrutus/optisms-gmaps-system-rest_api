import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import config, { validateConfig } from './config/index.js';
import logger from './utils/logger.js';
import cache from './utils/cache.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { apiKeyAuth } from './middlewares/auth.js';
import publicRoutes from './routes/public.js';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';
import vendorRoutes from './routes/vendor.js';

// Validate configuration
try {
  validateConfig();
  logger.info({ env: config.nodeEnv, port: config.port }, 'Configuration validated');
} catch (error) {
  logger.fatal({ error: error.message }, 'Configuration validation failed');
  process.exit(1);
}

const app = express();

// CORS configuration
const corsOptions = config.corsOrigins.includes('*')
  ? { origin: true, credentials: false }
  : {
      origin: function (origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      }
    };

// Middleware
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(pinoHttp({ logger }));

// Rate limiter for API
const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded');
    res.status(429).json({ error: 'Too many requests, please try again later' });
  }
});

// Routes
app.use('/', publicRoutes);
app.use('/', adminRoutes);
app.use('/api', apiLimiter, apiKeyAuth, apiRoutes);
app.use('/api', apiLimiter, apiKeyAuth, vendorRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start cache cleanup
if (config.enableCache) {
  cache.startCleanup();
  logger.info('Cache cleanup started');
}

// Start server
const server = app.listen(config.port, () => {
  logger.info({
    port: config.port,
    env: config.nodeEnv,
    baseUrl: config.baseUrl
  }, 'SMS Review Flow started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
