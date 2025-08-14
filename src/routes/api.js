import express from 'express';
import { nanoid } from 'nanoid';
import { addResponse, createSurvey, finalizeSurvey, getOrCreateContact, getSurvey, getSurveyFlow, db } from '../db/index.js';
import fetch from 'node-fetch';

const router = express.Router();

// New: fetch survey state for the static client
router.get('/survey/:id', (req, res) => {
  const { id } = req.params;
  const data = getSurveyFlow(id);
  if (!data?.survey) return res.status(404).json({ error: 'survey not found' });
  const threshold = data.survey.score_threshold ?? Number(process.env.SCORE_THRESHOLD || 8);
  const googleUrl = process.env.GOOGLE_PLACE_URL;
  const score = data.map?.score?.score;
  const showGoogle = typeof score === 'number' && score >= threshold;
  const brandName = process.env.BRAND_NAME || 'Memnuniyet Anketi';
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8080}`;
  const autoRedirectSeconds = Number(process.env.GOOGLE_AUTO_REDIRECT_SECONDS || 0);
  const finalizeOnGoogleClick = String(process.env.GOOGLE_FINALIZE_ON_CLICK || 'true').toLowerCase() === 'true';
  res.json({
    survey: data.survey,
    responses: data.responses,
    map: data.map,
    threshold,
    googleUrl,
    showGoogle,
    brandName,
    baseUrl,
    autoRedirectSeconds,
    finalizeOnGoogleClick
  });
});

// Track: user clicked the Google button
router.post('/survey/:id/google-click', (req, res) => {
  const { id } = req.params;
  const survey = getSurvey(id);
  if (!survey) return res.status(404).json({ error: 'survey not found' });
  db.prepare('UPDATE surveys SET google_clicked_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Track: user auto-redirected to Google
router.post('/survey/:id/google-redirect', (req, res) => {
  const { id } = req.params;
  const survey = getSurvey(id);
  if (!survey) return res.status(404).json({ error: 'survey not found' });
  db.prepare('UPDATE surveys SET google_redirected_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Create a survey link with optional metadata
router.post('/survey', (req, res) => {
  const { phone, name, locale = 'tr', scoreThreshold, patientId, department, doctor, visitDate } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone is required' });

  const contactId = getOrCreateContact({ phone, name, locale });
  const id = nanoid(10);
  createSurvey({
    id,
    contactId,
    scoreThreshold: scoreThreshold ?? Number(process.env.SCORE_THRESHOLD || 8),
    metadata: {
      patient_id: patientId,
      patient_name: name,
      phone,
      department,
      doctor,
      visit_date: visitDate,
      locale
    }
  });
  const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8080}`;
  const url = `${base}/s/${id}`;
  res.json({ id, url });
});

// General score 1..10
router.post('/survey/:id/score', (req, res) => {
  const { id } = req.params;
  const { score } = req.body;
  const survey = getSurvey(id);
  if (!survey) return res.status(404).json({ error: 'survey not found' });
  const s = parseInt(score, 10);
  if (!(s >= 1 && s <= 10)) return res.status(400).json({ error: 'score must be 1..10' });
  addResponse({ surveyId: id, step: 'score', score: s });
  // Complaint webhook for low scores (<=4)
  try {
    const th = Number(process.env.COMPLAINT_THRESHOLD || 4);
    const url = process.env.COMPLAINT_WEBHOOK_URL;
    if (url && s <= th) {
      const payload = {
        baslik: 'Düşük Puan Bildirimi',
        aciklama: `${survey.patient_name||''} (${survey.phone||''}) genel puan: ${s}`,
        surveyId: id,
        telefon: survey.phone,
        adSoyad: survey.patient_name,
        bolum: survey.department,
        doktor: survey.doctor,
        tarih: survey.visit_date,
        puan: s
      };
      fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }).catch(()=>{});
    }
  } catch {}
  res.json({ ok: true });
});

// Category scores 1..5 for Bek, Dr, Ekp, Bank, Sln, Tmz
router.post('/survey/:id/category', (req, res) => {
  const { id } = req.params;
  const { key, score } = req.body; // key in [bek, dr, ekp, bank, sln, tmz]
  const allowed = ['bek', 'dr', 'ekp', 'bank', 'sln', 'tmz'];
  if (!allowed.includes(String(key))) return res.status(400).json({ error: 'invalid key' });
  const s = parseInt(score, 10);
  if (!(s >= 1 && s <= 5)) return res.status(400).json({ error: 'score must be 1..5' });
  const survey = getSurvey(id);
  if (!survey) return res.status(404).json({ error: 'survey not found' });
  addResponse({ surveyId: id, step: key, score: s });
  res.json({ ok: true });
});

// NPS-like Tav 0..10
router.post('/survey/:id/tav', (req, res) => {
  const { id } = req.params;
  const { score } = req.body; // 0..10
  const s = parseInt(score, 10);
  if (!(s >= 0 && s <= 10)) return res.status(400).json({ error: 'tav must be 0..10' });
  const survey = getSurvey(id);
  if (!survey) return res.status(404).json({ error: 'survey not found' });
  addResponse({ surveyId: id, step: 'tav', score: s });
  res.json({ ok: true });
});

router.post('/survey/:id/comment', (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const survey = getSurvey(id);
  if (!survey) return res.status(404).json({ error: 'survey not found' });
  addResponse({ surveyId: id, step: 'comment', comment: String(comment || '').slice(0, 2000) });
  res.json({ ok: true });
});

router.post('/survey/:id/finalize', (req, res) => {
  const { id } = req.params;
  const { status = 'completed' } = req.body;
  const survey = getSurvey(id);
  if (!survey) return res.status(404).json({ error: 'survey not found' });
  finalizeSurvey({ surveyId: id, status });
  res.json({ ok: true });
});

// CSV export (simple)
router.get('/export/csv', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id as SurveyId, s.patient_id as HastaId, s.patient_name as AdSoyad, s.phone as Telefon,
           s.department as Bolum, s.doctor as Doktor, s.visit_date as Tarih,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='score' ORDER BY id DESC LIMIT 1) as Genel,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='bek' ORDER BY id DESC LIMIT 1) as Bek,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='dr' ORDER BY id DESC LIMIT 1) as Dr,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='ekp' ORDER BY id DESC LIMIT 1) as Ekp,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='bank' ORDER BY id DESC LIMIT 1) as Bank,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='sln' ORDER BY id DESC LIMIT 1) as Sln,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='tmz' ORDER BY id DESC LIMIT 1) as Tmz,
           (SELECT score FROM responses WHERE survey_id=s.id AND step='tav' ORDER BY id DESC LIMIT 1) as Tav,
           (SELECT comment FROM responses WHERE survey_id=s.id AND step='comment' ORDER BY id DESC LIMIT 1) as Yrm,
           s.status as Durum, s.created_at as KayitTarihi,
           s.google_clicked_at as GoogleTik, s.google_redirected_at as GoogleYonlendirme
    FROM surveys s
    ORDER BY s.created_at DESC
  `).all();

  const header = ['Tarih','Hasta Id','Ad-Soyad','Telefon','Bekleme','Doktor','Ekip','Banko','Servis','Temizlik','Tavsiye','Yorum','Bölüm','Doktor Adı','Genel','Durum','Kayit Tarihi','Google Tıklama','Google Yönlendirme'];
  let csv = [header.join(',')].concat(rows.map(r => [
    r.Tarih||'', r.HastaId||'', r.AdSoyad||'', r.Telefon||'', r.Bek||'', r.Dr||'', r.Ekp||'', r.Bank||'', r.Sln||'', r.Tmz||'', r.Tav||'', JSON.stringify(r.Yrm||''), r.Bolum||'', r.Doktor||'', r.Genel||'', r.Durum||'', r.KayitTarihi||'', r.GoogleTik||'', r.GoogleYonlendirme||''
  ].join(','))).join('\n');

  // Prepend BOM to help Excel recognize UTF-8
  csv = '\uFEFF' + csv;

  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="anket_export.csv"');
  res.send(csv);
});

export default router;
// Admin: list surveys with filters and pagination
router.get('/admin/surveys', (req, res) => {
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
