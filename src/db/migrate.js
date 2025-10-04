import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = process.env.DB_PATH || './data/app.db';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  name TEXT,
  locale TEXT DEFAULT 'tr',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  contact_id INTEGER,
  channel TEXT DEFAULT 'sms',
  score_threshold INTEGER DEFAULT 8,
  status TEXT DEFAULT 'pending',
  -- new metadata fields
  patient_id TEXT,
  patient_name TEXT,
  phone TEXT,
  department TEXT,
  doctor TEXT,
  visit_date TEXT,
  locale TEXT DEFAULT 'tr',
  google_clicked_at DATETIME,
  google_redirected_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id TEXT NOT NULL,
  step TEXT NOT NULL, -- e.g., score, comment, bek, dr, ekp, bank, sln, tmz, tav
  score INTEGER,
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_responses_survey ON responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_surveys_created_at ON surveys(created_at);
CREATE INDEX IF NOT EXISTS idx_surveys_status ON surveys(status);
CREATE INDEX IF NOT EXISTS idx_surveys_department ON surveys(department);
CREATE INDEX IF NOT EXISTS idx_surveys_doctor ON surveys(doctor);
CREATE INDEX IF NOT EXISTS idx_responses_step ON responses(step);
`);

// Idempotent ALTERs for existing DBs
try { db.prepare("ALTER TABLE surveys ADD COLUMN patient_id TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE surveys ADD COLUMN patient_name TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE surveys ADD COLUMN phone TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE surveys ADD COLUMN department TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE surveys ADD COLUMN doctor TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE surveys ADD COLUMN visit_date TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE surveys ADD COLUMN locale TEXT DEFAULT 'tr'").run(); } catch {}
try { db.prepare("ALTER TABLE surveys ADD COLUMN google_clicked_at DATETIME").run(); } catch {}
try { db.prepare("ALTER TABLE surveys ADD COLUMN google_redirected_at DATETIME").run(); } catch {}

console.log('Database migrated at', dbPath);
