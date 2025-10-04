import { db } from './index.js';

/**
 * Optimized query for admin surveys list
 * Before: 6+ subqueries per row (N+1 problem)
 * After: 1 query with JOINs and GROUP BY
 */
export function getAdminSurveys({ from, to, q, status, limit = 100, offset = 0 }) {
  const where = [];
  const params = [];

  if (from) {
    where.push('date(s.created_at) >= date(?)');
    params.push(from);
  }
  if (to) {
    where.push('date(s.created_at) <= date(?)');
    params.push(to);
  }
  if (status) {
    where.push('s.status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(s.patient_name LIKE ? OR s.phone LIKE ? OR s.department LIKE ? OR s.doctor LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';

  // Optimized query with LEFT JOINs instead of subqueries
  const query = `
    SELECT 
      s.id as SurveyId,
      s.patient_id as HastaId,
      s.patient_name as AdSoyad,
      s.phone as Telefon,
      s.department as Bolum,
      s.doctor as Doktor,
      s.visit_date as Tarih,
      s.status as Durum,
      s.created_at as KayitTarihi,
      MAX(CASE WHEN r.step = 'score' THEN r.score END) as Genel,
      MAX(CASE WHEN r.step = 'bek' THEN r.score END) as Bekleme,
      MAX(CASE WHEN r.step = 'dr' THEN r.score END) as DoktorSkor,
      MAX(CASE WHEN r.step = 'ekp' THEN r.score END) as Ekip,
      MAX(CASE WHEN r.step = 'bank' THEN r.score END) as Banko,
      MAX(CASE WHEN r.step = 'sln' THEN r.score END) as Servis,
      MAX(CASE WHEN r.step = 'tmz' THEN r.score END) as Temizlik,
      MAX(CASE WHEN r.step = 'tav' THEN r.score END) as Tavsiye,
      MAX(CASE WHEN r.step = 'comment' THEN r.comment END) as Yorum
    FROM surveys s
    LEFT JOIN responses r ON s.id = r.survey_id
    ${whereSql}
    GROUP BY s.id
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(query).all(...params, Number(limit), Number(offset));
  const count = db.prepare(`SELECT COUNT(*) as c FROM surveys s ${whereSql}`).get(...params).c;

  return { total: count, items: rows, limit: Number(limit), offset: Number(offset) };
}

/**
 * Get survey analytics
 */
export function getSurveyAnalytics({ from, to, status }) {
  const where = [];
  const params = [];

  if (from) {
    where.push('date(s.created_at) >= date(?)');
    params.push(from);
  }
  if (to) {
    where.push('date(s.created_at) <= date(?)');
    params.push(to);
  }
  if (status) {
    where.push('s.status = ?');
    params.push(status);
  }

  const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';

  const query = `
    SELECT 
      COUNT(DISTINCT s.id) as total_surveys,
      COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END) as completed,
      COUNT(DISTINCT CASE WHEN s.status = 'promoted' THEN s.id END) as promoted,
      COUNT(DISTINCT CASE WHEN s.status = 'pending' THEN s.id END) as pending,
      AVG(CASE WHEN r.step = 'score' THEN r.score END) as avg_score,
      COUNT(CASE WHEN r.step = 'score' AND r.score >= 8 THEN 1 END) as high_scores,
      COUNT(CASE WHEN r.step = 'score' AND r.score <= 4 THEN 1 END) as low_scores,
      AVG(CASE WHEN r.step = 'tav' THEN r.score END) as avg_nps,
      AVG(CASE WHEN r.step = 'bek' THEN r.score END) as avg_wait,
      AVG(CASE WHEN r.step = 'dr' THEN r.score END) as avg_doctor,
      AVG(CASE WHEN r.step = 'ekp' THEN r.score END) as avg_team,
      AVG(CASE WHEN r.step = 'bank' THEN r.score END) as avg_reception,
      AVG(CASE WHEN r.step = 'sln' THEN r.score END) as avg_service,
      AVG(CASE WHEN r.step = 'tmz' THEN r.score END) as avg_cleanliness,
      COUNT(DISTINCT CASE WHEN r.step = 'comment' AND r.comment IS NOT NULL AND r.comment != '' THEN s.id END) as with_comments,
      COUNT(DISTINCT CASE WHEN s.google_clicked_at IS NOT NULL THEN s.id END) as google_clicks,
      COUNT(DISTINCT CASE WHEN s.google_redirected_at IS NOT NULL THEN s.id END) as google_redirects
    FROM surveys s
    LEFT JOIN responses r ON s.id = r.survey_id
    ${whereSql}
  `;

  return db.prepare(query).get(...params);
}

/**
 * Get surveys created in last N days
 */
export function getRecentSurveys(days = 7) {
  const query = `
    SELECT 
      DATE(s.created_at) as date,
      COUNT(*) as count,
      AVG(CASE WHEN r.step = 'score' THEN r.score END) as avg_score
    FROM surveys s
    LEFT JOIN responses r ON s.id = r.survey_id
    WHERE s.created_at >= datetime('now', '-${days} days')
    GROUP BY DATE(s.created_at)
    ORDER BY date DESC
  `;
  
  return db.prepare(query).all();
}

/**
 * Get top/bottom performers by department or doctor
 */
export function getPerformanceByDimension(dimension = 'department', limit = 10) {
  const column = dimension === 'department' ? 's.department' : 's.doctor';
  
  const query = `
    SELECT 
      ${column} as name,
      COUNT(DISTINCT s.id) as survey_count,
      AVG(CASE WHEN r.step = 'score' THEN r.score END) as avg_score,
      COUNT(CASE WHEN r.step = 'score' AND r.score >= 8 THEN 1 END) as high_scores,
      COUNT(CASE WHEN r.step = 'score' AND r.score <= 4 THEN 1 END) as low_scores
    FROM surveys s
    LEFT JOIN responses r ON s.id = r.survey_id
    WHERE ${column} IS NOT NULL AND ${column} != ''
    GROUP BY ${column}
    HAVING survey_count >= 3
    ORDER BY avg_score DESC
    LIMIT ?
  `;
  
  return db.prepare(query).all(limit);
}

/**
 * Get response rate by step
 */
export function getResponseRates() {
  const query = `
    SELECT 
      COUNT(DISTINCT s.id) as total_surveys,
      COUNT(DISTINCT CASE WHEN r.step = 'score' THEN s.id END) as score_responses,
      COUNT(DISTINCT CASE WHEN r.step = 'bek' THEN s.id END) as category_responses,
      COUNT(DISTINCT CASE WHEN r.step = 'tav' THEN s.id END) as nps_responses,
      COUNT(DISTINCT CASE WHEN r.step = 'comment' THEN s.id END) as comment_responses
    FROM surveys s
    LEFT JOIN responses r ON s.id = r.survey_id
  `;
  
  return db.prepare(query).get();
}
