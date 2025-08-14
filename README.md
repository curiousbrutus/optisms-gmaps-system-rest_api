
SMS Review Flow – Türkçe Doküman

Ne işe yarar?
- Her hasta için bir anket linki üretir (/api/survey) ve 1–10 genel memnuniyet sayfası sunar.
- Genel puan eşik değeri (SCORE_THRESHOLD) veya üzeri ise Google Yorum butonu öne çıkar; gerekirse otomatik yönlendirme yapılır.
- Tüm yanıtları SQLite veritabanına kaydeder. SMS sağlayıcısından bağımsız webhook’larla çalışır.
- Basit bir Admin Listesi / Paneli ile anketleri görüntüler.

Kurulum (Windows PowerShell)
1) .env.example dosyasını .env olarak kopyalayın ve değişkenleri düzenleyin:
    - GOOGLE_PLACE_URL: Google yorum kısa linkiniz (örn: https://g.page/r/xxxx)
    - BASE_URL: Dışarıdan erişilen temel URL (örn: https://anket.sizin-domain.com)
    - SCORE_THRESHOLD: 8/9/10 (yüksek puan eşiği)
    - BRAND_NAME: Klinik adı (UI başlığı)
    - API_KEY: /api uçlarını korumak için isteğe bağlı token (Authorization: Bearer <token> veya x-api-key)
    - CORS_ORIGINS: Tarayıcıdan gelen kökenleri sınırlandırma (örn: https://domain.com,https://admin.domain.com)
    - RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX: Basit hız limiti
    - GOOGLE_AUTO_REDIRECT_SECONDS: >0 ise yüksek puanda otomatik Google yönlendirmesi (saniye)
    - GOOGLE_FINALIZE_ON_CLICK: true/false – Google’a tıklanınca anketi “promoted” olarak işaretle

2) Bağımlılıkları kurun ve veritabanını hazırlayın:
    npm install
    npm run db:migrate

3) Çalıştırın:
    npm run dev
    # Varsayılan: http://localhost:8080

Admin Paneli
- URL: /admin
- Filtreleme: tarih aralığı, durum, serbest metin arama (ad, telefon, bölüm, doktor)
- CSV indirme butonu: /api/export/csv
 - Güvenlik: Basic Auth etkinleştirmek için .env içine ADMIN_USER ve ADMIN_PASS girin. /admin ve /admin/api/* erişimi Basic ile korunur.
 - Metrikler: Toplam, Ortalama Genel, 8+ Oranı, Son 7 Gün (sayfa üstündeki kartlarda)

Survey Nasıl Üretilir?
- Mevcut SMS sisteminiz bu servise POST atar, dönen “url”’i SMS metnine koyar:
   - POST /api/survey
   - Body örneği: { phone, name, department, doctor, visitDate, locale }
   - Dönüş: { id, url }

Formu Doldurunca Neler Olur?
- Tarayıcı aşağıdaki uçlara POST yapar:
   - Genel (1–10): POST /api/survey/:id/score
   - Kategoriler (1–5): POST /api/survey/:id/category (key: bek, dr, ekp, bank, sln, tmz)
   - Tavsiye (0–10): POST /api/survey/:id/tav
   - Yorum: POST /api/survey/:id/comment
   - Finalize: POST /api/survey/:id/finalize (yüksek puan Google tıklamasında “promoted”)

Veri Nerede?
- Dosya: data/app.db (SQLite)
- Şema: src/db/migrate.js
   - contacts(id, phone, name, locale, created_at)
   - surveys(id, contact_id, score_threshold, channel, status, patient_id, patient_name, phone, department, doctor, visit_date, locale, created_at)
   - responses(id, survey_id, step, score, comment, created_at)

Raporlama / Erişim
- Admin API: GET /api/admin/surveys?from=YYYY-MM-DD&to=YYYY-MM-DD&q=arama&status=pending|completed|promoted
   - Sonuç: { total, items[], limit, offset }
- CSV: GET /api/export/csv (Excel-uyumlu UTF‑8 BOM)
- Tek survey durumu: GET /api/survey/:id (survey, responses, map, threshold, showGoogle, brandName vb.)
 - Google dönüşüm takibi: POST /api/survey/:id/google-click, POST /api/survey/:id/google-redirect (istemci tarafından tetiklenir)

Güvenlik Önerileri
- Üretimde API_KEY zorunlu olsun; CORS_ORIGINS değerlerini daraltın.
- HTTPS üzerinden yayınlayın.
- Twilio vb. webhooklarda imza doğrulaması ekleyin.
 - Admin için Basic Auth (ADMIN_USER/ADMIN_PASS) veya reverse proxy ile IP kısıtlama yapın.

Şikayet Bildirimi (Düşük Puan)
- ENV: COMPLAINT_WEBHOOK_URL, COMPLAINT_THRESHOLD (varsayılan 4)
- Genel puan s <= threshold olduğunda JSON olarak webhook’a bilgi gönderilir.
- Payload (örnek): { baslik, aciklama, surveyId, telefon, adSoyad, bolum, doktor, tarih, puan }

Admin Erişim Sorunları
- “Admin authentication not configured” hatası alırsanız .env dosyanızda ADMIN_USER ve ADMIN_PASS tanımlı mı kontrol edin. Sunucuyu yeniden başlatın.

Özelleştirme
- UI dosyaları: public/survey.html (anket), public/admin.html (panel)
- Sunucu ayarları: src/server.js, rota dosyaları: src/routes/*
- Eşik değer, yönlendirme vs. .env ile yönetilir.

Lisans
- MIT

Why this helps
- Single, seamless flow for the patient. No double SMS hops.
- Flexible threshold per hospital or campaign.
- Works with any SMS provider that can send a link.

Quick start (Windows PowerShell)
1) Copy .env.example to .env and edit values
   - GOOGLE_PLACE_URL: your Google review short link (e.g. https://g.page/r/xxxx)
   - BASE_URL: public base URL if exposed on the internet
   - SCORE_THRESHOLD: 8 or 9 or whatever you prefer
   - BRAND_NAME: clinic name for UI
   - API_KEY: optional token to protect /api (send via Authorization: Bearer <token> or x-api-key header)
   - CORS_ORIGINS: comma-separated origins (e.g. https://yourdomain.com,https://admin.yourdomain.com); defaults to *
   - RATE_LIMIT_WINDOW_MS: window for rate limiting (default 60000)
   - RATE_LIMIT_MAX: max requests per window per IP (default 120)
   - GOOGLE_AUTO_REDIRECT_SECONDS: if set (>0), high scorers auto-redirect to Google after N seconds
   - GOOGLE_FINALIZE_ON_CLICK: true/false, finalize survey status when user clicks Google button (default true)

2) Install deps and migrate DB
   npm install
   npm run db:migrate

3) Run
   npm run dev
   # Server on http://localhost:8080

4) Create a survey link (example)
   # Without API key
   Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/survey -ContentType 'application/json' -Body (@{ phone = "+905551112233"; name = "Ali" } | ConvertTo-Json)

   # With API key
   $headers = @{ 'Authorization' = 'Bearer YOUR_TOKEN' }
   Invoke-RestMethod -Method Post -Headers $headers -Uri http://localhost:8080/api/survey -ContentType 'application/json' -Body (@{ phone = "+905551112233"; name = "Ali" } | ConvertTo-Json)

   This returns { id, url }. Send the url via your SMS provider to the patient.

Integrations
- Generic: Have your SMS platform call /api/survey to get a link, then send as SMS.
- Webhook sample: POST /api/vendor/generic/inbound with { phone, name }. It returns the survey URL.
- Twilio inbound adapter: /api/vendor/twilio/inbound (responds with TwiML including the survey link).

n8n / Workflow ideas
- After discharge event, call /api/survey for each patient, inject the returned url into SMS template.
- Track completions via /api/survey/:id/finalize if you need closing signals.

Security notes
- Put this behind HTTPS when going live.
- Add auth (e.g., static header token) to /api endpoints if needed.
- For Twilio, implement signature validation before trusting incoming webhooks.
 - Configure CORS_ORIGINS to your admin domains for tighter browser security.
 - Enable API_KEY in production and rotate regularly.

Customization
- UI is in src/routes/public.js. You can brand colors, copy, and show more steps.
- Threshold can be per-survey via the create call.

Data schema
- contacts(phone, name, locale)
- surveys(id, contact_id, score_threshold, channel, status)
- responses(survey_id, step, score, comment)

License
- MIT
