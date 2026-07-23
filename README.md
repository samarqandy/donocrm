# donocrm

donocrm kichik o'quv markazlari va repetitorlar uchun ishlaydigan ta'lim boshqaruv dasturi. Tizim davomat, to'lovlar, qarzdorlik, guruhlar, dars jadvali, leadlar va Telegram xabarlar navbatini bitta panelda boshqaradi.

Backend modular Node.js arxitekturasida qurilgan va ma'lumotlar SQLite bazasida saqlanadi.

## Ishga tushirish

```bash
cd /var/www/dono
node server.js
```

Brauzerda oching:

```text
http://192.168.1.249:8081
```

## Login

Demo foydalanuvchilar faqat `NODE_ENV` production bo'lmaganda va `DONO_SEED_DEMO=true` bo'lganda yaratiladi:

- Admin: `admin` / `admin123`
- O'qituvchi: `teacher` / `teacher123`

Production bazasi bo'sh bo'lsa server ishga tushmaydi. Birinchi administratorni qo'lda yarating:

```bash
NODE_ENV=production npm run create-admin
```

Login qilingandan keyin server `HttpOnly` session cookie yaratadi. APIlar session bo'lmasa `401 Unauthorized` qaytaradi.

Parollar bazada PBKDF2 hash sifatida saqlanadi. Eski plaintext demo parollar server ishga tushganda avtomatik hashga migratsiya qilinadi.

## Production/pilot sozlamalari

Muhim environment o'zgaruvchilar:

```bash
PORT=8081
SQLITE_FILE=/var/www/dono/data/dono.sqlite
NODE_ENV=production
COOKIE_SECURE=true
```

Tekshiruv endpointlari:

- `GET /healthz` — server javob beradi.
- `GET /readyz` — SQLite ulanishi tayyor.

Static server faqat browser assetlarini beradi: `index.html`, `app.js`, `styles.css` va `screeshots/` ichidagi fayllar.

## QA smoke test

Full admin/teacher/API regression test:

```bash
node scripts/qa-smoke.js
```

Script vaqtinchalik SQLite bazasini `/tmp` ichida yaratadi, HTTP orqali barcha asosiy oqimlarni tekshiradi va yakunda tozalaydi.

## Imkoniyatlar

- Admin dashboard
- Teacher dashboard, jadval, davomat tarixi va profil
- O'quvchilar, guruhlar va darslar
- O'qituvchi profili, guruh/yuklama, ish vaqti va portal-access boshqaruvi
- Davomatni saqlash
- To'lov qo'shish va qarzdorlikni kamaytirish
- Telegram xabarlar navbati, avtomatik retry va yuborish logi
- Leadlar bilan ishlash
- Hisobotlar va audit log
- Tenant scope API
- Admin/Teacher permission check
- PBKDF2 password hash va HttpOnly session cookie
- Health/readiness endpointlar
- Uzbek/Russian til almashtirish
- Desktop va mobile responsive layout

## O'qituvchi paneli

Topbar orqali `Teacher` roliga o'tilganda o'qituvchi paneli ochiladi. O'qituvchi faqat o'ziga biriktirilgan darslarni ko'radi va faqat shu darslar uchun davomat saqlay oladi.

O'qituvchi panelida:

- `Asosiy` — bugungi darslar va tezkor davomat
- `Jadvalim` — o'z darslari ro'yxati
- `Davomat` — saqlangan davomat tarixi
- `Profil` — o'qituvchi ma'lumotlari

Administrator panelidagi `O'qituvchilar` moduli profil va login akkauntini alohida boshqaradi. O'qituvchini login bermasdan katalogga qo'shish yoki PBKDF2 bilan himoyalangan teacher-account yaratish mumkin. Profil kartasida guruhlar, o'quvchilar soni, haftalik yuklama, yaqin darslar va ish vaqti ko'rinadi. Arxivlash hard-delete qilmaydi: tarix saqlanadi, login bloklanadi va faol sessiyalar yopiladi. Faol guruh yoki kelajak darsi mavjud o'qituvchini arxivlash avval reassignment talab qiladi.

## Telegram bot token qo'shish

1. Telegramda `@BotFather` orqali bot yarating.
2. Bot tokenni oling.
3. donocrm ichida `Sozlamalar` bo'limiga kiring.
4. `Telegram sozlamalari` kartasida bot username va tokenni kiriting.
5. `Saqlash` tugmasini bosing.
6. O'quvchi profilidagi Telegram bo'limidan bir martalik ulash havolasini yarating va ota-onaga yuboring.

Ota-ona botni oddiy `/start` bilan ochsa, bot telefon raqamini Telegram'ning xavfsiz `request_contact` tugmasi orqali so'raydi. Faqat foydalanuvchining o'z kontakti qabul qilinadi. Raqam o'quvchi profilidagi ota-ona telefoniga mos kelsa, Telegram Chat ID avtomatik ulanadi; bir raqamga bir nechta farzand biriktirilgan bo'lsa, ularning barchasi ulanadi.

Saqlash paytida token Telegram Bot API orqali tekshiriladi. Token bazada AES-256-GCM bilan shifrlanadi, interfeysda esa faqat ulangan/ulanmagan holati ko'rsatiladi. Bir martalik ulash kodi bazada faqat SHA-256 digest ko'rinishida saqlanadi. Alohida worker botga kelgan `/start` va contact ulash komandalarini qabul qiladi hamda xabarlarni navbatdan avtomatik yuboradi. Vaqtinchalik Telegram xatolarida navbat exponential backoff bilan qayta urinadi; doimiy xatolar operatorga sababi bilan ko'rsatiladi.

## Arxitektura

- `server.js` — application entrypoint
- `src/http` — HTTP server, API router, static file serving
- `src/services` — biznes logika, permission, validation
- `src/repositories` — database query va persistence
- `src/db` — SQLite schema, migration/seed, DB client
- `src/config` — konfiguratsiya
- `src/utils` — umumiy helperlar

## Bozorga chiqarish

Ma'lumotlar `data/dono.sqlite` faylida saqlanadi. Kattaroq yuklama va ko'p markazli foydalanishda repository qatlami orqali PostgreSQLga ko'chiriladi.

Pilot va sotuv jarayoni uchun [MARKET_EXECUTION.md](/var/www/dono/MARKET_EXECUTION.md) hujjatidan foydalaning.
