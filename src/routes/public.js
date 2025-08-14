import express from 'express';
import { getSurveyFlow, db } from '../db/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'sms-review-flow', version: '1.0.0' });
});

// Serve static public assets
router.use('/public', express.static(path.join(projectRoot, 'public')));

// Use static SPA for survey, it will call API to load state
router.get('/s/:surveyId', (req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'survey.html'));
});

// Basic Auth helper for admin
function adminBasicAuth(req, res, next){
  const user = process.env.ADMIN_USER || '';
  const pass = process.env.ADMIN_PASS || '';
  if (!user || !pass) return res.status(500).send('Admin authentication not configured');
  const hdr = req.get('authorization') || '';
  if (!hdr.toLowerCase().startsWith('basic ')){
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required');
  }
  const creds = Buffer.from(hdr.split(' ')[1]||'', 'base64').toString();
  const [u, p] = creds.split(':');
  if (u === user && p === pass) return next();
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Unauthorized');
}

// Admin panel (static)
router.get('/admin', adminBasicAuth, (req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'admin.html'));
});

// Admin API under /admin/api to leverage browser Basic Auth
router.get('/admin/api/surveys', adminBasicAuth, (req, res) => {
  const { from, to, q, status, limit = 100, offset = 0 } = req.query;
  const where = [];
  const params = [];
  if (from) { where.push('date(s.created_at) >= date(?)'); params.push(from); }
  if (to) { where.push('date(s.created_at) <= date(?)'); params.push(to); }
  if (status) { where.push('s.status = ?'); params.push(status); }
  if (q) {
    where.push('(s.patient_name LIKE ? OR s.phone LIKE ? OR s.department LIKE ? OR s.doctor LIKE ?)');
    const like = `%${q}%`; params.push(like, like, like, like);
  }
  const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
  const rows = db.prepare(`
    SELECT s.id as SurveyId, s.patient_id as HastaId, s.patient_name as AdSoyad, s.phone as Telefon,
           s.department as Bolum, s.doctor as Doktor, s.visit_date as Tarih,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='score' ORDER BY id DESC LIMIT 1) as Genel,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='bek' ORDER BY id DESC LIMIT 1) as Bekleme,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='dr' ORDER BY id DESC LIMIT 1) as DoktorSkor,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='ekp' ORDER BY id DESC LIMIT 1) as Ekip,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='bank' ORDER BY id DESC LIMIT 1) as Banko,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='sln' ORDER BY id DESC LIMIT 1) as Servis,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='tmz' ORDER BY id DESC LIMIT 1) as Temizlik,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='tav' ORDER BY id DESC LIMIT 1) as Tavsiye,
           (SELECT comment FROM responses WHERE survey_id=s.id AND step='comment' ORDER BY id DESC LIMIT 1) as Yorum,
           s.status as Durum, s.created_at as KayitTarihi
    FROM surveys s
    ${whereSql}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));
  const count = db.prepare(`SELECT COUNT(*) as c FROM surveys s ${whereSql}`).get(...params).c;
  res.json({ total: count, items: rows, limit: Number(limit), offset: Number(offset) });
});

export default router;
