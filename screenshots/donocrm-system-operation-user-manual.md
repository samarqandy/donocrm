# DonoCRM: System Operation & User Manual

Versiya: 2026-07-09  
Til: Uzbek  
Auditoriya: administrator, o'qituvchi, texnik administrator, support muhandisi

## 1. KIRISH

### 1.1. DonoCRM nima?

DonoCRM - o'quv markazlari uchun yaratilgan multi-tenant ta'lim CRM tizimi. Tizim bitta web admin panel orqali quyidagi jarayonlarni boshqaradi:

- o'quvchilar ro'yxati;
- guruhlar va o'qituvchilar;
- dars jadvali;
- davomat;
- to'lovlar, qarzdorlik va ledger hisob-kitobi;
- Telegram xabarlar navbati;
- leadlar va pipeline bosqichlari;
- audit log va hisobotlar;
- Excel export.

Tizimning hozirgi texnik stack'i:

- Frontend: `index.html`, `app.js`, `styles.css`;
- Backend: Node.js HTTP server;
- Database: SQLite, fayl ko'rinishida `data/dono.sqlite`;
- Auth: HttpOnly cookie asosidagi session;
- Telegram: Bot API orqali xabar yuborish, cron queue processor bilan;
- Excel: `exceljs` orqali `.xlsx` fayllar.

### 1.2. Kimlar uchun?

Tizim ikki asosiy rol bilan ishlaydi:

- Admin: markazdagi barcha biznes jarayonlarni boshqaradi.
- Teacher: faqat o'ziga biriktirilgan darslar, guruhlar va davomat bilan ishlaydi.

Admin quyidagilarni qila oladi:

- o'quvchi yaratish, tahrirlash, o'chirish;
- guruh yaratish, tahrirlash, o'chirish;
- dars yaratish;
- davomat saqlash;
- ota-onalarga davomat bo'yicha Telegram alert yuborish;
- to'lov va qarz ledgerini yuritish;
- Telegram bot sozlash;
- lead pipeline boshqarish;
- Excel export qilish;
- audit tarixini ko'rish.

Teacher quyidagilarni qila oladi:

- o'z darslarini ko'rish;
- o'ziga biriktirilgan darslar bo'yicha davomat saqlash;
- o'z guruhlari va o'quvchilarini cheklangan formatda ko'rish.

Teacher uchun moliyaviy ma'lumotlar yashiriladi:

- o'quvchi qarzi va balans 0 ko'rinishida beriladi;
- guruh monthly fee 0 ko'rinishida beriladi;
- payments, messages, leads va admin settings endpointlari bloklanadi.

### 1.3. Texnik talablar

Minimal talablar:

- Node.js: modern versiya, `node:sqlite` modulini qo'llab-quvvatlashi kerak;
- npm;
- Linux server tavsiya qilinadi;
- production uchun systemd service;
- Telegram yuborish ishlashi uchun internet chiqishi;
- `exceljs` dependency o'rnatilgan bo'lishi kerak.

O'rnatilgan dependencylar:

```bash
npm install
```

Asosiy package hozir:

```json
{
  "dependencies": {
    "exceljs": "^4.4.0",
    "node-cron": "^4.6.0"
  }
}
```

## 2. TIZIM ARXITEKTURASI

### 2.1. Umumiy arxitektura

Matn ko'rinishidagi diagramma:

```text
[Browser / Frontend]
        |
        | HTTP fetch, same-origin cookie
        v
[Node.js Backend API]
        |
        | Repository SQL queries
        v
[SQLite DB: data/dono.sqlite]
        |
        | queued Telegram messages
        v
[Cron Queue Processor]
        |
        | HTTPS sendMessage
        v
[Telegram Bot API]
```

Frontend bitta sahifali admin panel sifatida ishlaydi. `app.js` state asosida sahifalarni render qiladi. Har bir mutatsiya, masalan o'quvchi qo'shish yoki to'lov qo'shish, backend API chaqiruvi orqali bajariladi.

Backend qatlamlari:

```text
server.js
  -> src/http/server.js
    -> src/http/api.js
      -> src/services/appService.js
        -> src/repositories/appRepository.js
          -> src/db/client.js
            -> SQLite
```

Har bir qatlamning vazifasi:

- `server.js`: application entrypoint, cronni ishga tushiradi va HTTP serverni tinglaydi.
- `src/http/server.js`: HTTP routing, health/readiness, static file serving, API dispatch.
- `src/http/api.js`: endpointlar, request body o'qish, response qaytarish, RBAC gate.
- `src/services/appService.js`: biznes qoidalar, validation, permission semantics.
- `src/repositories/appRepository.js`: SQL querylar, transactionlar, DB persistence.
- `src/db/client.js`: SQLite ulanish, schema, migration, seed, backfill.
- `src/db/schema.js`: asosiy jadval va indexlar.

### 2.2. Frontend qanday ishlaydi?

Browser `index.html`ni yuklaydi. Keyin:

1. `styles.css` yuklanadi.
2. `app.js` yuklanadi.
3. `checkAuth()` chaqiriladi.
4. Frontend `GET /api/me` orqali session bor-yo'qligini tekshiradi.
5. Agar session yo'q bo'lsa, login page render qilinadi.
6. Agar session bor bo'lsa, `GET /api/bootstrap` chaqiriladi.
7. Dashboard, sidebar va kerakli sahifa render qilinadi.

Frontend API wrapper:

- `fetch()` same-origin cookie bilan ishlaydi;
- `cache: "no-store"` ishlatiladi;
- JSON error bo'lsa `Error` tashlaydi;
- UI errorlarni toast orqali ko'rsatadi.

### 2.3. Backend qanday ishlaydi?

Backend sof Node.js HTTP server orqali ishlaydi. Express ishlatilmaydi. Har bir request uchun:

1. Security headerlar qo'yiladi:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: same-origin`
   - `Permissions-Policy`
2. URL parse qilinadi.
3. `/healthz` bo'lsa oddiy server health javobi qaytariladi.
4. `/readyz` bo'lsa SQLite `SELECT 1` orqali tayyorlik tekshiriladi.
5. `/api/` bilan boshlangan requestlar `src/http/api.js`ga beriladi.
6. Qolgan requestlar static file handler orqali `index.html`, `app.js`, `styles.css` va ruxsat berilgan assetlardan xizmat qiladi.

### 2.4. Rollar tizimi, RBAC

RBAC ikki joyda himoya qiladi:

1. HTTP API darajasida:
   - `requireAdmin(context)` teacher rolini admin endpointlardan qaytaradi.
2. Service/repository darajasida:
   - teacher faqat o'z `teacher_id`iga tegishli dars/guruh/o'quvchilarni ko'radi;
   - teacher boshqa o'qituvchining darsi uchun davomat saqlay olmaydi;
   - teacher boshqa o'qituvchining darsi uchun alert yubora olmaydi.

Admin uchun:

- barcha tenant ma'lumotlari ko'rinadi;
- finance, payments, messages, leads, settings endpointlari ochiq.

Teacher uchun:

- `/api/payments`, `/api/messages`, `/api/settings/telegram`, `/api/pipeline-stages`, `/api/import/students` kabi endpointlar 403 qaytaradi;
- `GET /api/students` faqat o'z guruhidagi o'quvchilarni qaytaradi, qarz va Telegram ID yashiriladi;
- `GET /api/groups` faqat o'z guruhlarini qaytaradi, monthly fee yashiriladi;
- `GET /api/lessons` faqat o'z darslarini qaytaradi.

### 2.5. Multi-tenancy xavfsizligi

Har bir asosiy jadvalda `tenant_id` bor. API request session cookie orqali userni topadi, userdan `tenantId` olinadi va barcha repository querylarda `WHERE tenant_id = ?` ishlatiladi.

Muhim joinlar ham tenant bilan cheklanadi:

- students -> groups: group tenant bir xil bo'lishi kerak;
- groups -> teachers: teacher tenant bir xil bo'lishi kerak;
- lessons -> groups -> teachers: hammasi tenant bilan bog'langan;
- attendance -> students/lessons/groups: tenant guard ishlatiladi;
- export payments -> students: tenant guard bilan join qilinadi.

Bu model bir tenant ma'lumoti boshqa tenant UI yoki API javobiga chiqib ketmasligi uchun kerak.

## 3. ISHGA TUSHIRISH KETMA-KETLIGI

### 3.1. 1-qadam: dependencylarni o'rnatish

Serverda:

```bash
cd /var/www/dono
npm install
```

Bu `node_modules`ni yaratadi va `package-lock.json` bo'yicha dependencylarni o'rnatadi.

Muhim dependencylar:

- `exceljs`: Excel export;
- `node-cron`: Telegram queue cron.

### 3.2. 2-qadam: server start

Amaliy entrypoint:

```bash
node server.js
```

Eslatma: `src/http/server.js` server factory va cron helperlarini export qiladi. To'g'ridan-to'g'ri `node src/http/server.js` ishga tushirish entrypoint emas, chunki u `listen()` chaqirmaydi. Real start uchun `server.js` ishlatiladi.

Systemd service:

```ini
WorkingDirectory=/var/www/dono
Environment=NODE_ENV=production
Environment=PORT=8081
Environment=SQLITE_FILE=/var/www/dono/data/dono.sqlite
Environment=COOKIE_SECURE=false
ExecStart=/usr/bin/node /var/www/dono/server.js
Restart=always
RestartSec=3
```

Production serverda:

```bash
sudo systemctl restart dono.service
sudo systemctl status dono.service --no-pager
```

### 3.3. 3-qadam: database initialization

Server ishga tushganda `getDb()` chaqiriladi. Ketma-ketlik:

1. `dataDir` mavjud bo'lmasa yaratiladi.
2. SQLite fayli ochiladi: default `data/dono.sqlite`.
3. `schema` bajariladi:
   - `PRAGMA foreign_keys = ON`;
   - `PRAGMA journal_mode = WAL`;
   - `PRAGMA busy_timeout = 5000`;
   - jadval va indexlar yaratiladi.
4. `migrate(db)` ishlaydi:
   - kerak bo'lsa `ALTER TABLE` bilan eski bazaga yangi columnlar qo'shiladi;
   - eski plaintext passwordlar PBKDF2 hashga o'tkaziladi;
   - `invoices_transactions`, `rooms`, `schedules`, `pipeline_stages` mavjudligi tekshiriladi;
   - messages table `processing` statusini qo'llab-quvvatlaydigan formatga rebuild qilinadi;
   - leads table stage check eski formatdan yangi pipeline formatga moslanadi;
   - indexlar yaratiladi.
5. `seed(db)` ishlaydi:
   - boshlang'ich tenant;
   - `admin/admin123`;
   - `teacher/teacher123`;
   - demo teachers, groups, students, lessons, payments, messages.
6. `migrate(db)` yana ishlaydi:
   - seeddan keyin kerakli column/backfilllar to'liq qo'llanadi.
7. `backfillLessonSchedules(db)` ishlaydi:
   - eski `lessons.time` qiymatlaridan `schedules` jadvali hosil qilinadi;
   - lessonlarga `schedule_id` ulanadi.
8. `backfillWalletLedger(db)` ishlaydi:
   - debt bor, lekin ledger yo'q o'quvchilarga opening charge yoziladi;
   - student `balance` va `debt` qayta hisoblanadi.

### 3.4. 4-qadam: cron job ishga tushishi

`server.js` ishga tushganda:

```text
startTelegramQueueCron()
```

chaqiriladi.

Cron har 5 daqiqada ishlaydi:

```text
*/5 * * * *
```

Cron logic:

1. DBdan active tenantlar olinadi:
   - `status = 'active'`;
   - `telegram_bot_token` bo'sh emas.
2. Har bir tenant uchun `processTenantQueue(tenant.id)` chaqiriladi.
3. Repository `processMessages(tenantId)` bajaradi.
4. `messages` jadvalidagi `queued` Telegram xabarlar `processing` qilib claim qilinadi.
5. Har bir xabar uchun:
   - student Telegram chat ID topiladi;
   - bot token olinadi;
   - Telegram Bot API `sendMessage` chaqiriladi;
   - muvaffaqiyatli bo'lsa `sent`;
   - token/chat ID yo'q bo'lsa `failed`;
   - vaqtinchalik xato bo'lsa 3 martagacha qayta `queued`, keyin `failed`.

### 3.5. 5-qadam: server tayyorligi

Health endpoint:

```bash
curl http://127.0.0.1:8081/healthz
```

Kutilgan javob:

```json
{"ok":true}
```

Readiness endpoint:

```bash
curl http://127.0.0.1:8081/readyz
```

Kutilgan javob:

```json
{"ok":true,"database":"ready"}
```

`/readyz` 200 qaytarsa:

- server ishlayapti;
- SQLite ochilgan;
- `SELECT 1` bajarilgan;
- app API ishlashga tayyor.

## 4. ADMINISTRATOR KUNLIK ISH TARTIBI

### 4.1. Kirish va dashboardni ko'rish

Admin login:

```text
Login: admin
Parol: admin123
```

UI ketma-ketligi:

1. Browser login sahifasini ochadi.
2. Admin login/parol kiritadi.
3. Frontend `POST /api/login` yuboradi.
4. Backend `AuthService.login()` orqali userni username bo'yicha topadi.
5. Password PBKDF2 hash bilan tekshiriladi.
6. Muvaffaqiyatli bo'lsa `sessions` jadvaliga yangi session yoziladi.
7. Backend `Set-Cookie: dono_session=...; HttpOnly; SameSite=Lax` qaytaradi.
8. Frontend user state'ni o'rnatadi va `GET /api/bootstrap` chaqiradi.
9. Dashboard render qilinadi.

Dashboard statistikasi qanday hisoblanadi:

- `students`: tenant bo'yicha o'quvchilar soni;
- `groups`: active guruhlar soni;
- `teachers`: o'qituvchilar soni;
- `lessonsToday`: bugungi darslar soni;
- `revenueToday`: bugungi payments summasi;
- `present/absent/late/excused`: bugungi attendance recordlar;
- `queuedMessages`: queue holatidagi Telegram xabarlar;
- `debtTotal`: o'quvchilar debt summasi.

Under the hood:

```text
Browser
  -> POST /api/login
  -> Set-Cookie dono_session
  -> GET /api/bootstrap
  -> AppService.bootstrap()
  -> repository.adminDashboard(tenantId)
  -> SQLite aggregate querylar
  -> dashboard JSON
  -> app.js render()
```

### 4.2. Yangi o'quvchi qo'shish

UI:

1. `O'quvchilar` sahifasiga kiring.
2. `Yangi o'quvchi` tugmasini bosing.
3. F.I.O., guruh, ota-ona, telefon va boshlang'ich qarz kiritiladi.
4. `Saqlash` bosiladi.

Frontend:

1. Modal ochilganda kerakli groups lazy-load qilinadi.
2. Form create mode bo'lsa inputlar bo'sh bo'ladi.
3. Submit paytida save button disabled bo'ladi va `Saqlanmoqda...` ko'rsatadi.
4. `POST /api/students` chaqiriladi.
5. Success bo'lsa modal yopiladi, list refresh qilinadi, toast chiqadi.
6. Error bo'lsa modal ochiq qoladi, button qayta enabled bo'ladi, error toast chiqadi.

Backend:

1. `requireAdmin(context)` teacherlarni bloklaydi.
2. `AppService.createStudent()` ishlaydi.
3. `groupId` majburiy va mavjud bo'lishi tekshiriladi.
4. `name` va `parentName` majburiy.
5. Repository `students` jadvaliga insert qiladi.
6. Agar `debt > 0` bo'lsa `invoices_transactions` jadvaliga `charge` yoziladi.
7. `syncStudentBalance()` balance va debtni qayta hisoblaydi.
8. `audit_logs`ga `created/student` yoziladi.

Database ta'siri:

- `students`: yangi row;
- `invoices_transactions`: boshlang'ich qarz bo'lsa `charge`;
- `audit_logs`: created student.

Muhim qoida:

```text
payment va discount balance'ni oshiradi
charge, refund, correction balance'ni kamaytiradi
debt = balance manfiy bo'lsa abs(balance), aks holda 0
```

### 4.3. O'quvchini tahrirlash va o'chirish

Tahrirlash:

1. O'quvchilar table/card action orqali edit bosiladi.
2. Modal current data bilan pre-fill bo'ladi.
3. `PUT /api/students/:id` yuboriladi.
4. Backend student borligini va group borligini tekshiradi.
5. `students` row update bo'ladi.
6. UI list refresh qiladi.

O'chirish:

1. Delete action bosiladi.
2. Confirm modal ochiladi.
3. `DELETE /api/students/:id` yuboriladi.
4. Repository transaction ichida:
   - student payments o'chiriladi;
   - messages `student_id` null qilinadi;
   - student o'chiriladi.
5. Audit log yoziladi.

### 4.4. Guruh qo'shish va boshqarish

UI:

1. `Guruhlar` sahifasiga kiring.
2. `Yangi guruh` bosing.
3. Guruh nomi, fan, o'qituvchi, xona, oylik to'lov kiriting.
4. Saqlang.

Backend:

1. `POST /api/groups`.
2. Admin permission tekshiriladi.
3. `teacherId` mavjudligi tekshiriladi.
4. `groups` jadvaliga insert bo'ladi.
5. Audit log yoziladi.

Guruh o'chirish qoidasi:

Guruhda quyidagilar bo'lsa o'chirish bloklanadi:

- students;
- lessons;
- schedules.

Backend `409` qaytaradi:

```text
Group has students or lessons and cannot be deleted
```

Bu foreign key va biznes ma'lumot buzilmasligi uchun kerak.

### 4.5. Yangi dars qo'shish

UI:

1. `Darslar` sahifasiga kiring.
2. `Yangi dars` tugmasini bosing.
3. Guruh tanlang.
4. Sana tanlang.
5. Boshlanish vaqtini tanlang.
6. Tugash vaqtini tanlang yoki `45/60/90/120 daq` presetini bosing.
7. Pastdagi preview `09:00 - 10:30` formatida ko'rinadi.
8. Saqlang.

Frontend professional time picker logic:

- foydalanuvchi endi qo'lda `17:00 - 18:30` yozmaydi;
- start/end selectlardan qiymat olinadi;
- duration preset bosilganda end time avtomatik hisoblanadi;
- backendga baribir eski contract bo'yicha `time: "HH:MM - HH:MM"` yuboriladi.

Backend:

1. `POST /api/lessons`.
2. `groupId` mavjudligi tekshiriladi.
3. `date` `YYYY-MM-DD` formatida strict parse qilinadi.
4. `time` `HH:MM - HH:MM` formatida strict parse qilinadi.
5. End time start timedan katta bo'lishi shart.
6. Shu group, date va time bilan duplicate lesson borligi tekshiriladi.
7. Duplicate bo'lsa `409 Lesson already exists`.
8. Dars weekday hisoblanadi.
9. Shu weekly slot uchun schedule bor bo'lsa qayta ishlatiladi.
10. Schedule yo'q bo'lsa `schedules` jadvaliga row qo'shiladi.
11. `lessons` jadvaliga dars qo'shiladi.
12. Audit log yoziladi.

Database ta'siri:

- `schedules`: kerak bo'lsa recurring schedule row;
- `lessons`: aniq sana uchun lesson row;
- `audit_logs`: created lesson.

### 4.6. Dars jadvali va calendar

`Darslar` sahifasida calendar haftalik ishlaydi.

Frontend:

1. `calendarDate` state saqlanadi.
2. `GET /api/schedules/week?date=YYYY-MM-DD` chaqiriladi.
3. Backend shu sananing haftasini topadi.
4. Calendar lessonlarni weekday va start/end time bo'yicha joylashtiradi.
5. Overlap bo'lsa lane layout ishlaydi, darslar bir-birini yopmaydi.
6. 20:00dan keyingi darslar bo'lsa calendar hour range avtomatik kengayadi.
7. Mobile'da calendar horizontal scroll bo'ladi.

Backend:

1. Sana strict validate qilinadi.
2. Admin barcha tenant darslarini ko'radi.
3. Teacher faqat o'z `teacher_id` darslarini ko'radi.
4. Query `schedules`, `groups`, `teachers`, `rooms`, `lessons`ni tenant guard bilan join qiladi.

### 4.7. Davomat saqlash

UI:

1. Dars card/calendar lesson ochiladi.
2. `Davomat` bosiladi.
3. Har bir o'quvchi uchun status tanlanadi:
   - Keldi (`present`);
   - Kelmadi (`absent`);
   - Kechikdi (`late`);
   - Sababli (`excused`).
4. `Saqlash` bosiladi.

Backend:

1. `POST /api/attendance`.
2. Lesson mavjudligi tekshiriladi.
3. Teacher bo'lsa lesson shu teacherga tegishli bo'lishi shart.
4. Lesson groupidagi o'quvchilar olinadi.
5. Har bir attendance record student shu groupga tegishli ekanligi tekshiriladi.
6. Eski attendance shu lesson uchun o'chiriladi.
7. Yangi attendance rowlar insert qilinadi.
8. Lesson status `completed` bo'ladi.
9. Audit log yoziladi.
10. Dashboard stats qayta hisoblanadi.

Database ta'siri:

- `attendance`: lesson bo'yicha recordlar yangilanadi;
- `lessons.status`: `completed`;
- `audit_logs`: saved attendance.

### 4.8. Davomat alertlarini Telegramga yuborish

UI:

1. Davomat oynasida absent yoki late bor bo'lsa alert yuborish mumkin.
2. Confirm modal chiqadi.
3. Tasdiqlanganda alertlar queuega qo'shiladi.

Backend:

1. `POST /api/lessons/:id/send-attendance-alerts`.
2. Lesson topiladi.
3. Teacher bo'lsa faqat o'z darsi uchun ruxsat.
4. `attendance`dan faqat `absent` va `late` statuslar olinadi.
5. Har bir record bo'yicha student `telegram_chat_id` tekshiriladi.
6. Chat ID yo'q bo'lsa skip qilinadi.
7. Chat ID bor bo'lsa `messages` jadvaliga `queued` xabar yoziladi.
8. Javobda `sent_count` va `skipped_count` qaytadi.

Muhim: Bu bosqichda Telegramga darhol yuborilmaydi. Faqat queue yaratiladi. Yuborish cron yoki manual process orqali bo'ladi.

### 4.9. To'lov qo'shish

UI:

1. `To'lovlar` sahifasiga kiring.
2. `To'lov qo'shish` bosing.
3. O'quvchi, summa, turi tanlanadi:
   - Naqd;
   - Karta;
   - O'tkazma.
4. Saqlang.

Backend:

1. `POST /api/payments`.
2. Admin permission tekshiriladi.
3. Student mavjudligi tekshiriladi.
4. Amount positive bo'lishi tekshiriladi.
5. Payment type enum tekshiriladi.
6. Transaction ichida:
   - `payments` jadvaliga row yoziladi;
   - `invoices_transactions` jadvaliga `payment` yoziladi;
   - student balance/debt sync qilinadi.
7. Telegram uchun `messages` jadvaliga queued payment notification yoziladi.
8. Audit log yoziladi.

Moliyaviy mantiq:

```text
charge     -> balance kamayadi, qarz oshadi
payment    -> balance oshadi, qarz kamayadi
discount   -> balance oshadi, qarz kamayadi
refund     -> balance kamayadi
correction -> balance kamayadi
```

Balance SQL orqali hisoblanadi:

```sql
SUM(CASE WHEN type IN ('payment', 'discount') THEN amount ELSE -amount END)
```

Shuning uchun cached `students.balance` faqat UI tezligi uchun sync qilinadi, asosiy haqiqat ledger hisobidan olinadi.

### 4.10. Student wallet va ledger

O'quvchi drawerida wallet/ledger ishlaydi.

API:

- `GET /api/students/:id/ledger`;
- `POST /api/students/:id/transactions`.

Transaction turlari:

- `payment`;
- `charge`;
- `discount`;
- `refund`;
- `correction`.

Idempotency guard:

`addTransaction` oxirgi 5 daqiqada bir xil student, type, amount va invoice_date bilan transaction bo'lsa duplicate insertni oldini oladi.

Bu foydalanuvchi ikki marta bosib yuborganda qarz/to'lov ikki marta yozilib ketmasligi uchun qo'yilgan himoya.

### 4.11. Telegram sozlamalari

UI:

1. `Sozlamalar` sahifasiga kiring.
2. Bot username va bot token kiriting.
3. `Saqlash` bosing.
4. Test chat ID bilan test yuborish mumkin.

Backend:

1. `POST /api/settings/telegram`.
2. Admin permission.
3. Token regex bilan validate qilinadi.
4. Token `tenants.telegram_bot_token`ga saqlanadi.
5. Audit log yoziladi.

Test:

1. `POST /api/telegram/test`.
2. Bot token olinadi.
3. Telegram Bot API `sendMessage` chaqiriladi.
4. Success/fail JSON qaytadi.

Security eslatma:

Hozir token DBda plaintext saqlanadi. Commercial production uchun tokenni environment variable yoki secret managerga ko'chirish tavsiya qilinadi.

### 4.12. Telegram xabarlar queue va manual process

Xabarlar quyidagi hollarda queuega tushadi:

- manual message yaratish;
- payment qabul qilinganda notification;
- attendance absent/late alert;
- import yoki boshqa avtomatik oqimlar.

Manual yuborish:

1. `Telegram` sahifasiga kiring.
2. `Navbatni yuborish` bosing.
3. Frontend `POST /api/messages/process` chaqiradi.
4. Backend `processMessages()` bajaradi.

Cron yuborish:

- Har 5 daqiqada avtomatik ishlaydi.
- Bir batchda 50 tagacha queued message claim qilinadi.

Message statuslari:

- `queued`: yuborishni kutyapti;
- `processing`: worker claim qilgan;
- `sent`: Telegramga yuborildi;
- `failed`: token/chat ID yoki Telegram xatosi sabab yuborilmadi.

### 4.13. Leadlar va pipeline

UI:

1. `Leadlar` sahifasiga kiring.
2. `Yangi lead` qo'shing.
3. Leadni pipeline columnlari orasida ko'chiring.
4. Kerak bo'lsa custom stage qo'shing.

Backend:

- `GET /api/pipeline-stages`;
- `POST /api/pipeline-stages`;
- `PUT /api/pipeline-stages/:id`;
- `DELETE /api/pipeline-stages/:id`;
- `GET /api/leads`;
- `POST /api/leads`;
- `PATCH /api/leads/:id/stage`.

Pipeline stage delete qoidasi:

1. System stage bo'lsa o'chirish 403.
2. Custom stage o'chirilsa:
   - shu stagedagi leadlar `new` stagega ko'chiriladi;
   - keyin stage o'chiriladi.

Bu foreign key va biznes oqimini buzmaslik uchun kerak.

### 4.14. Excel export

O'quvchilar export:

- UI: `O'quvchilar` sahifasida `Excelga yuklash`.
- API: `GET /api/export/students`.
- Query:
  - `id`, `name`, `phone`, `status`, `balance`;
  - tenant bo'yicha filter;
  - name bo'yicha sort.
- Fayl: `oquvchilar.xlsx`.

To'lovlar export:

- UI: `To'lovlar` sahifasida `Excelga yuklash`.
- API: `GET /api/export/payments`.
- Query:
  - invoices_transactions va students join;
  - faqat `payment` va `charge`;
  - tenant guard;
  - invoice_date desc.
- Fayl: `tolovlar.xlsx`.

Excel generation:

1. `exceljs` Workbook yaratiladi.
2. Header row yoziladi.
3. Data rowlar yoziladi.
4. Header bold qilinadi.
5. Columnlar auto-fit qilinadi.
6. Response content type `.xlsx` qilib qaytariladi.

### 4.15. Audit log va hisobotlar

Audit log quyidagi amallarda yoziladi:

- student created/updated/deleted;
- group created/updated/deleted;
- lesson created;
- attendance saved;
- attendance alerts queued;
- payment created/updated/deleted;
- wallet transaction created;
- message queued;
- message queue processed;
- Telegram settings updated;
- lead created/stage updated;
- pipeline stage created/updated/deleted;
- import students.

Audit row:

- tenant_id;
- user_id;
- role;
- action;
- entity;
- entity_id;
- created_at.

Bu support va commercial audit uchun muhim.

## 5. O'QITUVCHI KUNLIK ISH TARTIBI

### 5.1. Login

Demo teacher:

```text
Login: teacher
Parol: teacher123
```

Teacher login qilganda session xuddi admin kabi yaratiladi, lekin `role = teacher`.

### 5.2. Teacher dashboard

Teacher dashboard faqat bugungi va o'ziga tegishli darslar semantics bilan ishlaydi.

Teacher ko'radigan statistika:

- o'z guruhlaridagi studentlar soni;
- o'z guruhlar soni;
- bugungi darslar;
- yakunlangan va rejalashtirilgan darslar;
- davomat tarixi.

Moliyaviy ma'lumotlar teacherga berilmaydi.

### 5.3. Teacher davomat saqlashi

Teacher faqat:

- `lesson.teacherId === context.userId`

bo'lgan darsga davomat saqlay oladi.

Agar boshqa teacher darsiga request yuborsa:

```text
403 Only assigned teacher can save attendance
```

### 5.4. Teacher Telegram alert yuborishi

Teacher faqat o'z darsi uchun attendance alert queue qila oladi.

Agar lesson boshqa o'qituvchiga tegishli bo'lsa:

```text
403 Only assigned teacher can send attendance alerts
```

## 6. API SHARTNOMASI

### 6.1. Auth

```text
POST /api/login
POST /api/logout
GET  /api/me
```

Login body:

```json
{"username":"admin","password":"admin123"}
```

Success:

```json
{"user":{"id":"user_admin","tenantId":"tenant_main","username":"admin","name":"Administrator","role":"admin"}}
```

### 6.2. Bootstrap va lazy data

```text
GET /api/bootstrap
GET /api/students
GET /api/groups
GET /api/teachers
GET /api/lessons
GET /api/attendance-records
GET /api/payments
GET /api/messages
GET /api/leads
```

Frontend bootstrapdan keyin katta listlarni lazy-load qiladi. Bu birinchi renderni tezlatadi.

### 6.3. Mutatsiyalar

Students:

```text
POST   /api/students
PUT    /api/students/:id
DELETE /api/students/:id
GET    /api/students/:id/ledger
POST   /api/students/:id/transactions
POST   /api/students/:id/chat-id
```

Groups:

```text
POST   /api/groups
PUT    /api/groups/:id
DELETE /api/groups/:id
```

Lessons and attendance:

```text
POST /api/lessons
GET  /api/schedules/week?date=YYYY-MM-DD
POST /api/attendance
POST /api/lessons/:id/send-attendance-alerts
```

Payments:

```text
POST   /api/payments
PUT    /api/payments/:id
DELETE /api/payments/:id
```

Telegram:

```text
POST /api/messages
POST /api/messages/process
POST /api/settings/telegram
POST /api/telegram/test
```

Leads:

```text
GET    /api/pipeline-stages
POST   /api/pipeline-stages
PUT    /api/pipeline-stages/:id
DELETE /api/pipeline-stages/:id
GET    /api/leads
POST   /api/leads
PATCH  /api/leads/:id/stage
```

Import/export:

```text
POST /api/import/students
GET  /api/export/students
GET  /api/export/payments
```

## 7. DATABASE MODELI

### 7.1. Asosiy jadvallar

```text
tenants
users
sessions
teachers
groups
students
lessons
attendance
payments
invoices_transactions
rooms
schedules
messages
leads
pipeline_stages
audit_logs
```

### 7.2. Muhim relationshiplar

```text
tenant -> users
tenant -> teachers
tenant -> groups
group  -> students
group  -> lessons
lesson -> attendance
student -> payments
student -> invoices_transactions
student -> messages
tenant -> leads
tenant -> pipeline_stages
tenant -> audit_logs
```

### 7.3. SQLite PRAGMA

Schema boshida:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

Mazmuni:

- `foreign_keys`: referential integrity;
- `WAL`: concurrent read/write yaxshiroq;
- `busy_timeout`: lock paytida darhol yiqilmaslik.

### 7.4. Financial ledger

`payments` - eski UI/payment log uchun ishlatiladi.  
`invoices_transactions` - haqiqiy wallet/ledger manbasi.

Balance formula:

```text
payment + discount = plus
charge + refund + correction = minus
```

SQL:

```sql
SUM(CASE WHEN type IN ('payment', 'discount') THEN amount ELSE -amount END)
```

Student debt:

```text
if balance < 0:
  debt = abs(balance)
else:
  debt = 0
```

## 8. TELEGRAM INTEGRATION

### 8.1. Bot ulash

1. BotFather orqali bot yarating.
2. Token oling.
3. DonoCRM `Sozlamalar`ga kiriting.
4. Test chat ID orqali tekshiring.

### 8.2. Student Telegram chat ID

Student drawerda Telegram ID yoziladi. Bu `students.telegram_chat_id`ga saqlanadi.

Xabar yuborish uchun:

- message `student_id` bilan bog'langan bo'lsa, chat ID shu studentdan olinadi;
- legacy message bo'lsa recipient name/phone orqali chat ID qidiriladi.

### 8.3. Queue processing

Message yuborish ketma-ketligi:

```text
messages.status = queued
  -> processMessages()
  -> status = processing
  -> Telegram sendMessage
  -> sent yoki failed
```

Worker bir martada 50 tagacha xabar oladi.

### 8.4. Failure holatlari

Xabar failed bo'lishi mumkin:

- bot token yo'q;
- chat ID yo'q;
- chat ID noto'g'ri;
- Telegram Bot API xato qaytardi;
- internet yoki network xatosi;
- 3 marta urinishdan keyin ham yuborilmadi.

## 9. XAVFSIZLIK VA OPERATSION QOIDALAR

### 9.1. Session cookie

Cookie:

```text
dono_session
HttpOnly
SameSite=Lax
Max-Age=604800
```

`COOKIE_SECURE=true` bo'lsa `Secure` flag qo'shiladi. HTTP orqali ishlayotgan pilot serverda `COOKIE_SECURE=false` bo'lishi kerak.

### 9.2. Password hashing

Passwordlar PBKDF2 hash ko'rinishida saqlanadi. Eski plaintext passwordlar migration paytida hashga o'tkaziladi.

### 9.3. Static file exposure

Static server faqat ruxsat berilgan fayllarni beradi:

- `index.html`;
- `app.js`;
- `styles.css`;
- ruxsat berilgan asset prefix.

Private fayllar, DB, source fayllar static server orqali ochilmasligi kerak.

### 9.4. Tenant isolation

Har bir API request:

1. sessiondan user topadi;
2. userdan tenantId oladi;
3. querylarda `tenant_id = ?` ishlatadi.

Manual SQL yozilganda ham har doim tenant guard qo'yilishi shart.

## 10. OPERATION VA MAINTENANCE

### 10.1. Serverni restart qilish

```bash
cd /var/www/dono
sudo systemctl restart dono.service
sudo systemctl status dono.service --no-pager
```

### 10.2. Loglarni ko'rish

```bash
journalctl -u dono.service -n 100 --no-pager
journalctl -u dono.service -f
```

### 10.3. Health tekshirish

```bash
curl http://127.0.0.1:8081/healthz
curl http://127.0.0.1:8081/readyz
```

### 10.4. Loginni tekshirish

```bash
curl -i \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  http://127.0.0.1:8081/api/login
```

Kutilgan:

```text
HTTP/1.1 200 OK
Set-Cookie: dono_session=...
```

### 10.5. DB backup

SQLite fayl:

```text
/var/www/dono/data/dono.sqlite
```

Backup uchun service'ni qisqa to'xtatib yoki SQLite backup usuli bilan nusxa olish tavsiya qilinadi.

Oddiy copy:

```bash
sudo systemctl stop dono.service
cp /var/www/dono/data/dono.sqlite /var/www/dono/data/dono.sqlite.backup-$(date +%F-%H%M)
sudo systemctl start dono.service
```

WAL rejimda qo'shimcha `-wal` va `-shm` fayllar ham bo'lishi mumkin. Issiq backup kerak bo'lsa SQLite backup API yoki `.backup` ishlatilishi kerak.

### 10.6. Dependency yangilash

```bash
cd /var/www/dono
npm install
node scripts/qa-smoke.js
sudo systemctl restart dono.service
```

## 11. QA VA TEST

### 11.1. Smoke test

Full regression:

```bash
node scripts/qa-smoke.js
```

Tekshiradigan oqimlar:

- health/readiness;
- login/logout;
- admin bootstrap;
- lazy endpoints;
- weekly schedule;
- students CRUD;
- groups CRUD;
- lessons validation;
- duplicate lesson guard;
- payments CRUD;
- wallet ledger;
- Telegram settings/test/process;
- leads/pipeline;
- attendance save;
- attendance alerts;
- teacher RBAC;
- static private file block;
- password hashing.

### 11.2. Backend logic test

```bash
node scripts/test-backend-logic.js
```

Asosiy maqsad:

- financial math;
- frontend-backend contract;
- RBAC;
- orphan prevention;
- tenant isolation.

### 11.3. Manual QA checklist

Har release oldidan:

1. Admin login.
2. Teacher login.
3. Yangi o'quvchi qo'shish.
4. Yangi guruh qo'shish.
5. Yangi dars qo'shish.
6. Calendar haftalik jadvalni tekshirish.
7. Davomat saqlash.
8. Absent/late alert queue qilish.
9. To'lov qo'shish.
10. Student ledgerni tekshirish.
11. Excel export.
12. RU/UZ toggle.
13. Mobile view.
14. Logout.

## 12. TROUBLESHOOTING

### 12.1. Login/parol noto'g'ri chiqsa

Avval API to'g'ri ishlayaptimi tekshiring:

```bash
curl -i \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  http://127.0.0.1:8081/api/login
```

Agar curl 200 qaytarsa, backend auth ishlayapti. Muammo browser cache/cookie/frontend bo'lishi mumkin.

Brauzerda:

- Ctrl+F5;
- incognito;
- site data va cookies clear;
- to'g'ri port: `http://SERVER_IP:8081`.

Serverda:

```bash
sudo systemctl restart dono.service
```

### 12.2. Cookie saqlanmasa

Tekshiring:

- HTTP ishlatilsa `COOKIE_SECURE=false`;
- HTTPS reverse proxy bo'lsa `COOKIE_SECURE=true` bo'lishi mumkin;
- domain/port bir xil bo'lishi kerak.

### 12.3. Excel yuklanmasa

Tekshiring:

```bash
npm install exceljs
sudo systemctl restart dono.service
```

Endpoint:

```bash
curl -I http://127.0.0.1:8081/api/export/students
```

Eslatma: export admin session talab qiladi. Browserdan login qilingan holda tugma bosilishi kerak.

### 12.4. Telegram xabar yuborilmasa

Tekshiring:

1. Bot token sozlanganmi?
2. Student Telegram chat ID yozilganmi?
3. Message status `queued`, `sent`, yoki `failed`mi?
4. `/api/messages/process` manual bosilganda nima bo'ladi?
5. Server internetga chiqa oladimi?
6. Bot userga xabar yuborishi uchun user botga `/start` bosganmi?

### 12.5. Dars qo'shishda vaqt xatosi

Backend qabul qiladigan format:

```text
HH:MM - HH:MM
```

Frontend time picker bu formatni avtomatik yaratadi. Agar API orqali qo'lda request yuborilsa:

- sana `YYYY-MM-DD`;
- start/end valid;
- end startdan katta;
- duplicate group/date/time bo'lmasligi kerak.

### 12.6. Guruh o'chmayapti

Guruhda o'quvchi, dars yoki schedule bor bo'lsa backend 409 qaytaradi. Avval bog'langan ma'lumotlarni ko'chirish yoki yakunlash kerak.

### 12.7. Teacher admin action qila olmayapti

Bu xato emas. RBAC bo'yicha teacher:

- student yaratmaydi;
- payment qo'shmaydi;
- settings o'zgartirmaydi;
- lead/pipeline boshqarmaydi;
- import/export qilmaydi.

## 13. DEFAULT LOGINLAR VA MUHIM BUYRUQLAR

Default loginlar:

```text
Admin:   admin   / admin123
Teacher: teacher / teacher123
```

Start:

```bash
cd /var/www/dono
node server.js
```

Systemd restart:

```bash
sudo systemctl restart dono.service
```

Health:

```bash
curl http://127.0.0.1:8081/healthz
curl http://127.0.0.1:8081/readyz
```

Tests:

```bash
node scripts/qa-smoke.js
node scripts/test-backend-logic.js
```

DB:

```text
/var/www/dono/data/dono.sqlite
```

## 14. COMMERCIAL SAAS UCHUN MUHIM ESLATMALAR

Hozirgi DonoCRM ishlaydigan SaaS admin panel darajasida. Commercial production uchun quyidagilar alohida nazorat qilinishi kerak:

1. Telegram bot tokenni secret managerga chiqarish.
2. SQLite backup va restore tartibini avtomatlashtirish.
3. Reverse proxy HTTPS sozlash.
4. `COOKIE_SECURE=true`ni HTTPS bilan yoqish.
5. DB migrationlarni release checklistga kiritish.
6. Audit log retention siyosatini belgilash.
7. Error monitoring va log aggregation qo'shish.
8. Full responsive QA va browser compatibility regression.
9. Tenant onboarding va tenant provisioningni alohida oqim qilish.
10. Role/permission matrixni dokumentatsiya qilish va test bilan himoyalash.

## 15. QISQA OPERATSION XULOSA

DonoCRM ish jarayoni quyidagicha:

```text
Admin login qiladi
  -> session cookie yaratiladi
  -> bootstrap dashboard keladi
  -> admin o'quvchi/guruh/dars/to'lov/lead boshqaradi
  -> backend validation va RBAC bajaradi
  -> repository SQL transaction yozadi
  -> audit log yoziladi
  -> frontend listlarni refresh qiladi
  -> Telegram xabar kerak bo'lsa queuega tushadi
  -> cron har 5 daqiqada queue xabarlarni Telegram APIga yuboradi
```

Bu qo'llanma support, deployment, manual QA va yangi administratorni o'qitish uchun asosiy operatsion hujjat sifatida ishlatiladi.
