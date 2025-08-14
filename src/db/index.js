import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Default DB path: projectRoot/data/app.db (src/db -> projectRoot is ../..)
const defaultDbPath = path.resolve(__dirname, '../../data/app.db');
const envPath = process.env.DB_PATH && process.env.DB_PATH.trim().length > 0 ? process.env.DB_PATH : defaultDbPath;
const dbPath = path.isAbsolute(envPath) ? envPath : path.resolve(__dirname, '../../', envPath);

// Ensure directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbPath);

export function getSurvey(id) {
  const survey = db.prepare('SELECT * FROM surveys WHERE id = ?').get(id);
  return survey;
}

export function createContact({ phone, name, locale = 'tr' }) {
  const info = db.prepare('INSERT INTO contacts (phone, name, locale) VALUES (?, ?, ?)').run(phone, name, locale);
  return info.lastInsertRowid;
}

export function getOrCreateContact({ phone, name, locale = 'tr' }) {
  const existing = db.prepare('SELECT * FROM contacts WHERE phone = ?').get(phone);
  if (existing) return existing.id;
  return createContact({ phone, name, locale });
}

export function createSurvey({ id, contactId, scoreThreshold = 8, channel = 'sms', metadata = {} }) {
  const { patient_id, patient_name, phone, department, doctor, visit_date, locale = 'tr' } = metadata;
  db.prepare(`INSERT INTO surveys (id, contact_id, score_threshold, channel, patient_id, patient_name, phone, department, doctor, visit_date, locale)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, contactId, scoreThreshold, channel, patient_id, patient_name, phone, department, doctor, visit_date, locale);
}

export function addResponse({ surveyId, step, score = null, comment = null }) {
  db.prepare('INSERT INTO responses (survey_id, step, score, comment) VALUES (?, ?, ?, ?)')
    .run(surveyId, step, score, comment);
}

export function finalizeSurvey({ surveyId, status }) {
  db.prepare('UPDATE surveys SET status = ? WHERE id = ?').run(status, surveyId);
}

export function getSurveyFlow(surveyId) {
  const survey = getSurvey(surveyId);
  const responses = db.prepare('SELECT * FROM responses WHERE survey_id = ? ORDER BY id').all(surveyId);
  // Build a map for category scores
  const map = Object.fromEntries(responses.map(r => [r.step, r]));
  return { survey, responses, map };
}
