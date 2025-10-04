import { nanoid } from 'nanoid';
import { db, getSurvey, addResponse, finalizeSurvey, getSurveyFlow } from '../db/index.js';
import { getOrCreateContact, createSurvey } from '../db/index.js';
import { getAdminSurveys, getSurveyAnalytics, getRecentSurveys, getPerformanceByDimension, getResponseRates } from '../db/queries.js';
import config from '../config/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import logger from '../utils/logger.js';
import fetch from 'node-fetch';
import cache from '../utils/cache.js';

export class SurveyService {
  /**
   * Create a new survey
   */
  static createSurvey({ phone, name, locale = 'tr', scoreThreshold, patientId, department, doctor, visitDate }) {
    try {
      const contactId = getOrCreateContact({ phone, name, locale });
      const id = nanoid(10);
      
      createSurvey({
        id,
        contactId,
        scoreThreshold: scoreThreshold ?? config.scoreThreshold,
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
      
      const url = `${config.baseUrl}/s/${id}`;
      
      logger.info({ surveyId: id, phone, department }, 'Survey created');
      
      return { id, url };
    } catch (error) {
      logger.error({ error, phone }, 'Failed to create survey');
      throw new AppError('Failed to create survey', 500);
    }
  }

  /**
   * Get survey with full context
   */
  static getSurveyContext(id) {
    const cacheKey = `survey:${id}`;
    
    // Check cache
    if (config.enableCache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        logger.debug({ surveyId: id }, 'Survey context from cache');
        return cached;
      }
    }
    
    const data = getSurveyFlow(id);
    if (!data?.survey) {
      throw new AppError('Survey not found', 404);
    }
    
    const threshold = data.survey.score_threshold ?? config.scoreThreshold;
    const score = data.map?.score?.score;
    const showGoogle = typeof score === 'number' && score >= threshold;
    
    const context = {
      survey: data.survey,
      responses: data.responses,
      map: data.map,
      threshold,
      googleUrl: config.googlePlaceUrl,
      showGoogle,
      brandName: config.brandName,
      baseUrl: config.baseUrl,
      autoRedirectSeconds: config.googleAutoRedirectSeconds,
      finalizeOnGoogleClick: config.googleFinalizeOnClick
    };
    
    // Cache for 5 minutes
    if (config.enableCache) {
      cache.set(cacheKey, context, config.cacheMaxAge * 1000);
    }
    
    return context;
  }

  /**
   * Submit general score
   */
  static submitScore(surveyId, score) {
    const survey = getSurvey(surveyId);
    if (!survey) throw new AppError('Survey not found', 404);
    
    const s = parseInt(score, 10);
    if (!(s >= 1 && s <= 10)) throw new AppError('Score must be 1..10', 400);
    
    addResponse({ surveyId, step: 'score', score: s });
    
    // Invalidate cache
    cache.delete(`survey:${surveyId}`);
    
    // Send complaint notification for low scores
    this.sendComplaintNotification(survey, s);
    
    logger.info({ surveyId, score: s, phone: survey.phone }, 'Score submitted');
    
    return { ok: true };
  }

  /**
   * Submit category score
   */
  static submitCategory(surveyId, key, score) {
    const survey = getSurvey(surveyId);
    if (!survey) throw new AppError('Survey not found', 404);
    
    const s = parseInt(score, 10);
    if (!(s >= 1 && s <= 5)) throw new AppError('Score must be 1..5', 400);
    
    addResponse({ surveyId, step: key, score: s });
    cache.delete(`survey:${surveyId}`);
    
    logger.debug({ surveyId, key, score: s }, 'Category score submitted');
    
    return { ok: true };
  }

  /**
   * Submit NPS score
   */
  static submitNPS(surveyId, score) {
    const survey = getSurvey(surveyId);
    if (!survey) throw new AppError('Survey not found', 404);
    
    const s = parseInt(score, 10);
    if (!(s >= 0 && s <= 10)) throw new AppError('NPS must be 0..10', 400);
    
    addResponse({ surveyId, step: 'tav', score: s });
    cache.delete(`survey:${surveyId}`);
    
    logger.debug({ surveyId, nps: s }, 'NPS submitted');
    
    return { ok: true };
  }

  /**
   * Submit comment
   */
  static submitComment(surveyId, comment) {
    const survey = getSurvey(surveyId);
    if (!survey) throw new AppError('Survey not found', 404);
    
    const sanitized = String(comment || '').slice(0, 2000);
    addResponse({ surveyId, step: 'comment', comment: sanitized });
    cache.delete(`survey:${surveyId}`);
    
    logger.info({ surveyId, commentLength: sanitized.length }, 'Comment submitted');
    
    return { ok: true };
  }

  /**
   * Finalize survey
   */
  static finalizeSurvey(surveyId, status = 'completed') {
    const survey = getSurvey(surveyId);
    if (!survey) throw new AppError('Survey not found', 404);
    
    finalizeSurvey({ surveyId, status });
    cache.delete(`survey:${surveyId}`);
    
    logger.info({ surveyId, status }, 'Survey finalized');
    
    return { ok: true };
  }

  /**
   * Track Google button click
   */
  static trackGoogleClick(surveyId) {
    const survey = getSurvey(surveyId);
    if (!survey) throw new AppError('Survey not found', 404);
    
    db.prepare('UPDATE surveys SET google_clicked_at = CURRENT_TIMESTAMP WHERE id = ?').run(surveyId);
    cache.delete(`survey:${surveyId}`);
    
    logger.info({ surveyId }, 'Google button clicked');
    
    return { ok: true };
  }

  /**
   * Track Google auto-redirect
   */
  static trackGoogleRedirect(surveyId) {
    const survey = getSurvey(surveyId);
    if (!survey) throw new AppError('Survey not found', 404);
    
    db.prepare('UPDATE surveys SET google_redirected_at = CURRENT_TIMESTAMP WHERE id = ?').run(surveyId);
    cache.delete(`survey:${surveyId}`);
    
    logger.info({ surveyId }, 'Google auto-redirect tracked');
    
    return { ok: true };
  }

  /**
   * Send complaint notification webhook
   */
  static sendComplaintNotification(survey, score) {
    try {
      const threshold = config.complaintThreshold;
      const url = config.complaintWebhookUrl;
      
      if (!url || score > threshold) return;
      
      const payload = {
        baslik: 'Düşük Puan Bildirimi',
        aciklama: `${survey.patient_name || ''} (${survey.phone || ''}) genel puan: ${score}`,
        surveyId: survey.id,
        telefon: survey.phone,
        adSoyad: survey.patient_name,
        bolum: survey.department,
        doktor: survey.doctor,
        tarih: survey.visit_date,
        puan: score
      };
      
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => {
        logger.error({ err, surveyId: survey.id }, 'Failed to send complaint webhook');
      });
      
      logger.info({ surveyId: survey.id, score }, 'Complaint notification sent');
    } catch (error) {
      logger.error({ error }, 'Error in complaint notification');
    }
  }

  /**
   * Get admin surveys list (optimized)
   */
  static getAdminSurveys(filters) {
    const cacheKey = `admin:surveys:${JSON.stringify(filters)}`;
    
    if (config.enableCache) {
      const cached = cache.get(cacheKey);
      if (cached) return cached;
    }
    
    const result = getAdminSurveys(filters);
    
    if (config.enableCache) {
      cache.set(cacheKey, result, 60000); // 1 minute cache
    }
    
    return result;
  }

  /**
   * Get comprehensive analytics
   */
  static getAnalytics(filters) {
    const cacheKey = `analytics:${JSON.stringify(filters)}`;
    
    if (config.enableCache) {
      const cached = cache.get(cacheKey);
      if (cached) return cached;
    }
    
    const analytics = getSurveyAnalytics(filters);
    const recentTrends = getRecentSurveys(7);
    const departmentPerformance = getPerformanceByDimension('department', 10);
    const doctorPerformance = getPerformanceByDimension('doctor', 10);
    const responseRates = getResponseRates();
    
    // Calculate NPS category
    const nps = analytics.avg_nps;
    let npsCategory = 'Fair';
    if (nps >= 9) npsCategory = 'Excellent';
    else if (nps >= 7) npsCategory = 'Good';
    else if (nps < 5) npsCategory = 'Poor';
    
    // Calculate conversion rate
    const conversionRate = analytics.total_surveys > 0 
      ? ((analytics.google_clicks / analytics.total_surveys) * 100).toFixed(2)
      : 0;
    
    const result = {
      overview: {
        ...analytics,
        avg_score: analytics.avg_score ? parseFloat(analytics.avg_score.toFixed(2)) : 0,
        avg_nps: analytics.avg_nps ? parseFloat(analytics.avg_nps.toFixed(2)) : 0,
        high_score_rate: analytics.total_surveys > 0 
          ? ((analytics.high_scores / analytics.total_surveys) * 100).toFixed(1)
          : 0,
        google_conversion_rate: conversionRate,
        nps_category: npsCategory
      },
      trends: recentTrends,
      performance: {
        byDepartment: departmentPerformance,
        byDoctor: doctorPerformance
      },
      responseRates: {
        total: responseRates.total_surveys,
        score: ((responseRates.score_responses / responseRates.total_surveys) * 100).toFixed(1),
        categories: ((responseRates.category_responses / responseRates.total_surveys) * 100).toFixed(1),
        nps: ((responseRates.nps_responses / responseRates.total_surveys) * 100).toFixed(1),
        comments: ((responseRates.comment_responses / responseRates.total_surveys) * 100).toFixed(1)
      }
    };
    
    if (config.enableCache) {
      cache.set(cacheKey, result, 120000); // 2 minutes cache
    }
    
    return result;
  }

  /**
   * Export surveys to CSV
   */
  static exportCSV() {
    const rows = db.prepare(`
      SELECT 
        s.id as SurveyId,
        s.patient_id as HastaId,
        s.patient_name as AdSoyad,
        s.phone as Telefon,
        s.department as Bolum,
        s.doctor as Doktor,
        s.visit_date as Tarih,
        MAX(CASE WHEN r.step = 'score' THEN r.score END) as Genel,
        MAX(CASE WHEN r.step = 'bek' THEN r.score END) as Bek,
        MAX(CASE WHEN r.step = 'dr' THEN r.score END) as Dr,
        MAX(CASE WHEN r.step = 'ekp' THEN r.score END) as Ekp,
        MAX(CASE WHEN r.step = 'bank' THEN r.score END) as Bank,
        MAX(CASE WHEN r.step = 'sln' THEN r.score END) as Sln,
        MAX(CASE WHEN r.step = 'tmz' THEN r.score END) as Tmz,
        MAX(CASE WHEN r.step = 'tav' THEN r.score END) as Tav,
        MAX(CASE WHEN r.step = 'comment' THEN r.comment END) as Yrm,
        s.status as Durum,
        s.created_at as KayitTarihi,
        s.google_clicked_at as GoogleTik,
        s.google_redirected_at as GoogleYonlendirme
      FROM surveys s
      LEFT JOIN responses r ON s.id = r.survey_id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `).all();

    const header = ['Tarih', 'Hasta Id', 'Ad-Soyad', 'Telefon', 'Bekleme', 'Doktor', 'Ekip', 
                    'Banko', 'Servis', 'Temizlik', 'Tavsiye', 'Yorum', 'Bölüm', 'Doktor Adı', 
                    'Genel', 'Durum', 'Kayit Tarihi', 'Google Tıklama', 'Google Yönlendirme'];
    
    const csvRows = rows.map(r => [
      r.Tarih || '',
      r.HastaId || '',
      r.AdSoyad || '',
      r.Telefon || '',
      r.Bek || '',
      r.Dr || '',
      r.Ekp || '',
      r.Bank || '',
      r.Sln || '',
      r.Tmz || '',
      r.Tav || '',
      JSON.stringify(r.Yrm || ''),
      r.Bolum || '',
      r.Doktor || '',
      r.Genel || '',
      r.Durum || '',
      r.KayitTarihi || '',
      r.GoogleTik || '',
      r.GoogleYonlendirme || ''
    ].join(','));

    let csv = [header.join(','), ...csvRows].join('\n');
    
    // Prepend BOM for Excel UTF-8 support
    csv = '\uFEFF' + csv;
    
    logger.info({ rowCount: rows.length }, 'CSV export generated');
    
    return csv;
  }
}
