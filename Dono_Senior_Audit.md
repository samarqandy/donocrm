# Dono — Senior Audit

**Sana:** 2026-07-06  
**Audit obyekti:** `/var/www/dono` joriy kod bazasi  
**Solishtirish bazasi:** AlfaCRM (`https://alfacrm.pro/`) va oldingi AlfaCRM audit hujjati

---

## 1. Umumiy baho

Dono hozir ishlaydigan, brauzer orqali ochiladigan ta'lim boshqaruv dasturi holatida. Unda Admin va Teacher panellar, o'quvchi/guruh/dars, davomat, to'lov, qarzdorlik, Telegram xabarlar navbati, leadlar va audit log bor.

Lekin hozirgi holat hali AlfaCRM darajasidagi production SaaS emas. Asosiy sabablar: real authentication yo'q, JSON fayl DB sifatida ishlatilgan, Telegram Bot API ulanmagan, CRUD to'liq emas, validatsiya va testlar yetarli emas, multi-tenant izolyatsiya header orqali simulyatsiya qilingan.

**Senior baho:** 10 dan 4.8  
**Investor/pilot ko'rsatish bahosi:** 10 dan 7.0  
**Production SaaS bahosi:** 10 dan 3.5  
**AlfaCRMga nisbatan yetuklik:** taxminan 15-20%

---

## 2. Kuchli tomonlar

- Product fokus to'g'ri: davomat, to'lov, qarzdorlik, Telegram.
- UI minimal, yengil va tushunarli.
- Admin va Teacher oqimlari ajratilgan.
- Tenant ID barcha asosiy entitylarda bor.
- Backend API bor, ma'lumotlar refreshdan keyin saqlanadi.
- Teacher roli to'lov kabi admin amallarni bajara olmaydi.
- Davomat va to'lovdan keyin Telegram queue yozuvi yaratiladi.
- AlfaCRMdan minimal kerakli yo'nalishlar olingan: lead, audit log, xabar queue, hisobot.

---

## 3. Critical findings

### 3.1. Auth yo'q, role va tenant client header orqali berilyapti

Joylar:

- `app.js:168-174`
- `server.js:141-146`

Frontend `X-Role`, `X-User-Id`, `X-Tenant-Id` headerlarini o'zi yuboryapti. Har qanday foydalanuvchi browser devtools yoki curl orqali `X-Role: admin` qilib admin APIlarni chaqira oladi.

Ta'sir:

- Real foydalanuvchiga chiqarish xavfli.
- Multi-tenant izolyatsiya buzilishi mumkin.
- Teacher admin bo'lib qolishi mumkin.

Kerakli yechim:

- Login/session yoki JWT auth.
- Role va tenant server-side sessiondan olinadi.
- Headerdan tenant/role qabul qilish productionda yopiladi.
- Super Admin, Admin, Teacher policy layer yoziladi.

### 3.2. JSON fayl database sifatida ishlatilgan

Joylar:

- `server.js:91-98`
- `data/db.json`

Har request butun DB faylni o'qiydi va yozadi. Bir vaqtning o'zida ikki request kelsa, yozuvlar yo'qolishi mumkin. Index, transaction, constraint, backup, migration yo'q.

Ta'sir:

- 2-3 admin bir vaqtda ishlasa data corruption xavfi bor.
- Hisobotlar va qidiruv sekinlashadi.
- Audit va payment kabi moliyaviy ma'lumot uchun yetarli emas.

Kerakli yechim:

- PostgreSQL.
- Migrationlar.
- Transactionlar.
- Foreign key va unique constraintlar.
- Backup va restore strategiyasi.

### 3.3. Tenant isolation konseptual bor, lekin xavfsiz emas

Joylar:

- `server.js:149-150`
- `server.js:225-236`

Ko'p querylar `tenantRows` orqali filter qilinadi, bu yaxshi boshlanish. Lekin tenant serverdagi authdan emas, request headerdan olinadi.

Ta'sir:

- Boshqa tenant IDni bilgan odam ma'lumotni ko'rishi mumkin.

Kerakli yechim:

- Tenant sessiondan olinadi.
- Har query repository/service qatlamidan o'tadi.
- Cross-tenant access feature testlari yoziladi.

### 3.4. Telegram real integratsiya emas

Joylar:

- `server.js:281`
- `server.js:296`
- `server.js:312-323`

Hozir message queue faqat JSONga yoziladi va "process" bosilganda `sent` bo'ladi. Bot token, chat_id, webhook/polling, retry delay, failure reason yo'q.

Ta'sir:

- Productning asosiy farqlovchi ustuni hali real emas.

Kerakli yechim:

- Telegram Bot API.
- Parent `chat_id` bog'lash flow.
- Queue worker.
- Retry/backoff.
- Failed reason va admin alert.
- Message template va i18n.

### 3.5. Payment modeli moliyaviy hisob uchun yetarli emas

Joylar:

- `server.js:287-299`

To'lov kiritilganda student debt kamayadi, lekin invoice/obligation, oy, qaytarish, noto'g'ri to'lovni bekor qilish, payment audit, cashier, filial, payment receipt yo'q.

Ta'sir:

- Real markazda moliyaviy tortishuvda ma'lumot yetarli bo'lmaydi.

Kerakli yechim:

- `payment_obligations`
- `payments`
- `payment_allocations`
- `refunds/voids`
- immutable audit log
- receipt number

### 3.6. Dashboard statistikasi hardcoded offset bilan aralashgan

Joylar:

- `server.js:186-187`

Davomat hisobida real attendance ustiga `+61`, `+7` qo'shilgan. Bu UI chiroyli ko'rinishi uchun qilingan, lekin real dasturda noto'g'ri hisobot beradi.

Kerakli yechim:

- Faqat real attendance recordlardan hisoblash.
- Date filter.
- Group/teacher filter.

---

## 4. High findings

### 4.1. Full CRUD yo'q

Bor:

- create student
- create group
- create lesson
- create payment
- create message
- create lead

Yo'q:

- edit
- delete/archive
- restore
- detail page
- status change history
- bulk actions

AlfaCRM bilan farq:

- AlfaCRM ma'lumotlar tarixi, sozlashlar va biznes jarayonlarni chuqur yuritadi. Donoda hozir faqat create + list.

### 4.2. Search input ishlamaydi

Joy:

- `app.js:274`

Qidiruv input bor, lekin hech qaysi jadvalni filter qilmaydi.

### 4.3. i18n to'liq emas

Joylar:

- `app.js:295-299`
- `app.js:417-427`

Ko'p matnlar inglizcha yoki hardcoded: `tenant scoped`, `real API`, `payments`, `Audit log`, `Attempts`, `Tenant`, `Status`, `Plan`.

### 4.4. UI rol switch production uchun noto'g'ri

Joy:

- `app.js:276-279`

Role switch demo uchun qulay, lekin real dasturda foydalanuvchi o'z rolini o'zi almashtirmasligi kerak.

### 4.5. Validation yetarli emas

Joylar:

- `server.js:239-349`
- `app.js:497-505`

Bo'sh ism, manfiy summa, noto'g'ri groupId, noto'g'ri phone, invalid status kabi holatlar tekshirilmaydi.

### 4.6. Static file path himoyasi zaif

Joylar:

- `server.js:358-364`

`path.join(ROOT, pathname)` va `startsWith(ROOT)` ishlatilgan, lekin path normalize/resolve bilan qat'iy tekshirish kerak.

---

## 5. Architecture audit

### Hozirgi arxitektura

- `server.js` — API, static server, DB access, domain logic, auth simulation hammasi bitta faylda.
- `app.js` — UI rendering, state, API client, translations, forms hammasi bitta faylda.
- `data/db.json` — persistent storage.
- `styles.css` — butun UI style.

### Baholash

Bu yondashuv tez prototip uchun yaxshi, lekin real platforma uchun monolit fayl juda tez murakkablashadi.

### Tavsiya qilingan arxitektura

Backend:

- `src/server.js`
- `src/routes/*`
- `src/services/*`
- `src/repositories/*`
- `src/policies/*`
- `src/validators/*`
- `src/jobs/telegramWorker.js`
- PostgreSQL + migration

Frontend:

- Vite + React/Vue yoki server-rendered template
- Componentlar: Dashboard, Students, Groups, Lessons, Attendance, Payments, Messages, Leads
- Shared i18n
- Form validation

---

## 6. API audit

Mavjud endpointlar:

- `GET /api/bootstrap`
- `POST /api/students`
- `POST /api/groups`
- `POST /api/lessons`
- `POST /api/attendance`
- `POST /api/payments`
- `POST /api/messages`
- `POST /api/messages/process`
- `POST /api/leads`
- `POST /api/import/students`

Yaxshi tomon:

- Endpointlar product oqimga mos.
- Attendance va paymentdan keyin message queue yaratiladi.
- Teacher assigned lesson bo'lmasa attendance saqlay olmaydi.

Kamchiliklar:

- REST to'liq emas: GET detail, PATCH, DELETE yo'q.
- Pagination yo'q.
- Filter/sort/search yo'q.
- Error response formati standart emas.
- API versioning yo'q.
- CSRF/auth yo'q.
- Input validation yo'q.
- Rate limiting yo'q.
- Idempotency yo'q, ayniqsa payment uchun.

---

## 7. Data model audit

Bor entitylar:

- tenants
- users
- students
- groups
- teachers
- lessons
- attendance
- payments
- messages
- leads
- auditLogs

Yetishmayotgan muhim entitylar:

- parents alohida jadval sifatida
- parent_student pivot
- payment_obligations/invoices
- payment methods/cashboxes
- message_templates
- telegram_links
- branches
- subjects/courses
- rooms
- schedules
- lesson series
- user sessions
- role_permissions

Eng katta model xatosi:

- `student.parentName` string sifatida saqlangan. Bitta ota-ona bir nechta farzandga bog'lanishi uchun parent alohida entity bo'lishi kerak.

---

## 8. UI/UX audit

Kuchli tomonlar:

- Admin dashboard fokusli.
- Teacher panel sodda.
- Asosiy CTA aniq: davomat, to'lov, xabar.
- Responsive CSS bor.
- Kartalar va tablelar vizual jihatdan toza.

Kamchiliklar:

- Search ishlamaydi.
- Empty/loading/error state to'liq emas.
- Modal formalar default qiymatlar bilan ochiladi, real ishda xatoga olib keladi.
- Edit/delete yo'q.
- Role switch real dasturga mos emas.
- Buttonlarda ikonlar matn/simvol bilan qilingan, icon library yo'q.
- Keyboard navigation/accessibility tekshirilmagan.
- Mobile table UX hali noqulay bo'lishi mumkin.

AlfaCRM bilan farq:

- AlfaCRM katta tizim bo'lsa ham dashboard, sozlash, kabinet, integratsiyalar, knowledge base va support signaliga ega.
- Dono UI soddaroq va tezroq tushuniladi, lekin professional operatsion chuqurlik yetishmaydi.

---

## 9. Security audit

Hozir production uchun bloklovchi muammolar:

1. Auth yo'q.
2. Role client header orqali.
3. Tenant client header orqali.
4. CSRF yo'q.
5. Rate limiting yo'q.
6. Input sanitization/validation yo'q.
7. File DB.
8. HTTPS/session/cookie security yo'q.
9. Audit immutable emas.
10. Static file path himoyasi kuchaytirilmagan.

---

## 10. AlfaCRM bilan solishtirish

AlfaCRM o'z saytida quyidagilarni ko'rsatadi:

- foydani oshirish, xodim nazorati, o'qituvchi ish haqi, loyalty, student mobile app, online QR payment;
- ko'p vertikal: til maktabi, programming, sport, mental arifmetika, art, beauty education;
- sales funnel: telefon, sayt, social, emaildan lead yig'ish;
- custom analytics dashboard;
- abonement, dars, to'lov, shartnoma va o'zgarishlar tarixi;
- moliyaviy analytics: CAC, LTV, ARPU, churn;
- client cabinet, homework, news, payment, feedback;
- 30+ integratsiya: telefoniya, SMS/messenger, acquiring, online cashbox;
- 5000+ tashkilot ishlatishi kabi trust signal.

### Jadval

| Yo'nalish | Dono hozir | AlfaCRM |
|---|---|---|
| Davomat | Bor, sodda | Bor, chuqur |
| To'lov | Bor, sodda debt reduce | Abonement, hisob, moliya |
| Telegram | Queue simulyatsiya | Knowledge base'da messenger/Telegram yo'nalishi bor |
| Leadlar | Minimal list/create | Full sales funnel |
| Parent cabinet | Yo'q | Bor |
| Mobile app | Yo'q | Student app bor |
| Online payment | Yo'q | QR/online payment bor |
| Integratsiyalar | Yo'q | 30+ |
| Analytics | Basic cards | Custom dashboard, finance metrics |
| Roles | Admin/Teacher basic | Flexible access levels |
| Multi-tenant | Header-based simulation | Production platform |
| Support/docs | README | Knowledge base |
| Production readiness | Past | Yuqori |

### Dono ustunligi

- O'zbek bozori va Telegram-first positioning.
- Kichik markazlar uchun soddaroq.
- Tez tushuniladi.
- Keraksiz ERP murakkabligi yo'q.

### Dono kamchiligi

- Hali real platforma infrasi yo'q.
- AlfaCRMdagi muhim biznes jarayonlar yo'q.
- Security/auth/DB darajasi production emas.
- Support/docs/onboarding yo'q.

---

## 11. Top platforma darajasiga chiqish uchun roadmap

### 1-bosqich: Production foundation

- PostgreSQL migration.
- Real auth/session.
- Role-permission policy.
- Server-side tenant resolution.
- Validation layer.
- Automated tests.
- Backup.

### 2-bosqich: Core CRM completeness

- Full CRUD.
- Student profile.
- Parent entity.
- Group schedule.
- Lesson series.
- Attendance history.
- Payment obligations.
- Invoice/receipt.
- Search/filter/pagination.

### 3-bosqich: Telegram-first differentiator

- Bot API.
- Parent linking.
- Message templates.
- Queue worker.
- Retry/backoff.
- Failed delivery status.
- Uzbek/Russian message templates.

### 4-bosqich: AlfaCRMdan kerakli modullar

- Lead pipeline.
- Import from Excel/CSV UI.
- Basic finance reports.
- Teacher payroll basic.
- Branches.
- Local payments: Payme, Click, Uzum.
- SMS fallback.

### 5-bosqich: Trust and operations

- Help center.
- Onboarding wizard.
- Activity log.
- Error monitoring.
- Admin support panel.
- Data export.
- Legal/privacy docs.

---

## 12. Yakuniy xulosa

Dono hozir yaxshi yo'nalishda va kichik o'quv markazlari uchun product fokus to'g'ri tanlangan. AlfaCRMni to'g'ridan-to'g'ri nusxalash kerak emas; Dono Telegram-first, Uzbek/Russian, sodda va tez platforma bo'lishi kerak.

Ammo "to'liq ishlaydigan dastur" darajasiga chiqish uchun hozirgi eng muhim vazifa UIga yangi funksiya qo'shish emas. Avval production foundation kerak:

1. Auth.
2. PostgreSQL.
3. Tenant isolation.
4. Validation.
5. Real Telegram.
6. Full CRUD.
7. Tests.

Shularsiz Dono investor demo yoki ichki pilot sifatida yaxshi, lekin AlfaCRMga raqobatchi production platforma sifatida hali tayyor emas.
