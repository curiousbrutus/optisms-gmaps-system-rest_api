import express from 'express';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { createSurvey, getOrCreateContact } from '../db/index.js';

const router = express.Router();

// Generic webhook to receive delivery or click events from any SMS provider (optional)
router.post('/vendor/generic/inbound', (req, res) => {
  // Example payload expectations: { phone, name, locale, text }
  const { phone, name, locale = 'tr' } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone is required' });

  const contactId = getOrCreateContact({ phone, name, locale });
  const id = nanoid(10);
  createSurvey({ id, contactId, scoreThreshold: Number(process.env.SCORE_THRESHOLD || 8) });
  const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8080}`;
  const url = `${base}/s/${id}`;

  res.json({ ok: true, id, url });
});

// Twilio webhook adapter example (validation optional)
router.post('/vendor/twilio/inbound', (req, res) => {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return res.status(500).send('Twilio token missing');

  // Validate signature if needed (skipped in this lightweight example)
  const from = req.body.From;
  const body = req.body.Body;
  if (!from) return res.status(400).send('Missing From');

  const contactId = getOrCreateContact({ phone: from, name: undefined, locale: 'tr' });
  const id = nanoid(10);
  createSurvey({ id, contactId, scoreThreshold: Number(process.env.SCORE_THRESHOLD || 8) });

  const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8080}`;
  const url = `${base}/s/${id}`;
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Message>Değerlendirmeniz için teşekkürler. Anket: ${url}</Message></Response>`);
});

export default router;
