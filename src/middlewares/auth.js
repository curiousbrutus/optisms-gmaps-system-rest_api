import config from '../config/index.js';
import { AppError } from './errorHandler.js';

export function apiKeyAuth(req, res, next) {
  if (!config.apiKey) return next(); // disabled if no key
  
  const authHeader = req.get('authorization') || '';
  const viaAuth = authHeader.toLowerCase().startsWith('bearer ') && 
                  authHeader.slice(7).trim() === config.apiKey;
  const viaHeader = req.get('x-api-key') === config.apiKey;
  
  if (viaAuth || viaHeader) return next();
  
  throw new AppError('Unauthorized - invalid API key', 401);
}

export function adminBasicAuth(req, res, next) {
  const user = config.adminUser;
  const pass = config.adminPass;
  
  if (!user || !pass) {
    throw new AppError('Admin authentication not configured', 500);
  }
  
  const hdr = req.get('authorization') || '';
  
  if (!hdr.toLowerCase().startsWith('basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    throw new AppError('Authentication required', 401);
  }
  
  const creds = Buffer.from(hdr.split(' ')[1] || '', 'base64').toString();
  const [u, p] = creds.split(':');
  
  if (u === user && p === pass) return next();
  
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  throw new AppError('Unauthorized', 401);
}
