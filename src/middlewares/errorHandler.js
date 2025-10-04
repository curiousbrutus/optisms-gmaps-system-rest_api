import logger from '../utils/logger.js';

export class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  
  // Log error
  if (statusCode >= 500) {
    logger.error({
      err,
      req: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body
      }
    }, message);
  } else {
    logger.warn({
      statusCode,
      message,
      url: req.url,
      method: req.method
    });
  }
  
  // Send response
  res.status(statusCode).json({
    error: message,
    statusCode,
    timestamp: err.timestamp || new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
};
