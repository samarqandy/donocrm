# Dono — Implementation Plan

**Asos:** `Dono_02_Business_Requirements.md`
**Maqsad:** BRD talablarini real ishlab chiqish bosqichlariga ajratish.
**Yondashuv:** avval xavfli arxitektura qarorlari, keyin MVP oqimlari, so'ngra Telegram va polish.

---

## 1. Senior review xulosasi

BRD mahsulot yo'nalishini yaxshi belgilagan: Dono murakkab CRM emas, kichik o'quv markazlari va repetitorlar uchun uchta asosiy ishni tezlashtiradigan SaaS bo'lishi kerak: davomat, to'lov, Telegram xabar.

Loyihaning eng muhim texnik qarorlari boshidan to'g'ri qilinishi shart:

- Multi-tenant arxitektura keyinga qoldirilmaydi.
- Har bir jadval va API so'rovida `tenant_id` izolyatsiyasi majburiy bo'ladi.
- Rollar sodda, lekin aniq bo'ladi: `super_admin`, `admin`, `teacher`.
- Ota-ona kabineti qilinmaydi; Telegram bog'lash oqimi alohida UX sifatida loyihalanadi.
- v1 minimal bo'ladi, lekin keyingi billing va katta markazlarga kengayishga tayyor bo'ladi.

Asosiy risklar:

- Telegram `chat_id` bog'lash noto'g'ri loyihalansa, aloqa moduli ishlamay qoladi.
- Tenant izolyatsiyasi test qilinmasa, xavfsizlik buzilishi xavfi yuqori.
- "Yana bitta kichik funksiya"lar MVPni ortiqcha murakkablashtirishi mumkin.

---

## 2. Hali hal qilinishi kerak bo'lgan savollar

Ishlab chiqishni boshlashdan oldin quyidagilar bo'yicha qaror kerak:

1. Davomat statuslari: faqat `keldi/kelmadi`mi yoki `kechikdi`, `sababli` ham bo'ladimi?
2. To'lov turi: `naqd`, `karta`, `o'tkazma` ajratiladimi?
3. Bitta ota-ona bir nechta bolaga bog'lansa, Telegram xabarlari qanday formatda ketadi?
4. O'qituvchi to'lov ma'lumotini ko'radimi yoki faqat Admin ko'radimi?
5. Dars jadvali qat'iymi yoki har bir dars qo'lda ochiladimi?

MVP uchun tavsiya:

- Davomat: `present`, `absent`, `late`, `excused`.
- To'lov: `cash`, `card`, `transfer`.
- O'qituvchi to'lovlarni ko'rmaydi.
- Bitta ota-ona bir nechta bolaga bog'lanishi mumkin.
- Darslar jadval asosida yaratiladi, kerak bo'lsa qo'lda ham qo'shiladi.

---

## 3. Tavsiya qilingan texnik stack

Loyiha hali boshlanmagan bo'lsa, quyidagi stack amaliy va tez:

- Backend: Laravel 11 yoki 12
- Frontend: Blade + Livewire yoki Inertia + Vue/React
- Database: PostgreSQL
- Queue: Redis
- Auth: Laravel Breeze/Fortify asosida moslashtirilgan auth
- Telegram: Bot API + queue worker + retry
- i18n: Uzbek lotin va Russian translation files

Sabab:

- SaaS admin panel, role-permission, queue, notification va database migration Laravelda tez va tartibli chiqadi.
- PostgreSQL tenant izolyatsiyasi, indekslar va hisobotlar uchun ishonchli.
- Telegram xabarlarini sinxron yubormasdan queue orqali boshqarish kerak.

---

## 4. Domain model

Minimal asosiy entitylar:

- `tenants` — markaz/repetitor akkaunti.
- `users` — tizim foydalanuvchilari.
- `tenant_users` — user va tenant orasidagi rol bog'lanishi.
- `students` — o'quvchilar.
- `parents` — ota-onalar.
- `parent_student` — ota-ona va bola bog'lanishi.
- `teachers` — o'qituvchi profili.
- `groups` — guruhlar.
- `group_student` — guruh a'zolari.
- `lessons` — darslar.
- `attendance_records` — davomat.
- `payments` — to'lovlar.
- `payment_obligations` — oy/guruh bo'yicha qarzdorlik.
- `telegram_links` — parent va Telegram chat bog'lanishi.
- `message_templates` — xabar matnlari.
- `message_logs` — yuborilgan/yuborilmagan xabarlar.

Qoidalar:

- Super admin jadvallaridan tashqari barcha biznes jadvallarda `tenant_id` bo'ladi.
- API va querylar tenant scope orqali ishlaydi.
- Tenant scope bypass faqat Super Admin service qatlamida ruxsat etiladi.

---

## 5. MVP scope

v1 uchun majburiy modullar:

1. Auth va tenant tanlash
2. Super Admin paneli
3. Admin dashboard
4. O'quvchi, ota-ona, o'qituvchi boshqaruvi
5. Guruh va dars jadvali
6. Davomat belgilash
7. To'lov kiritish va qarzdorlik
8. Telegram bog'lash va avtomatik xabarlar
9. Uzbek/Russian interfeys
10. Asosiy hisobotlar

v1 ga kiritilmaydi:

- Online billing
- Parent web cabinet
- Mobile app
- Murakkab buxgalteriya
- Imtihon/test moduli
- Payroll

---

## 6. Bosqichma-bosqich ishlab chiqish rejasi

### Phase 0 — Product clarification

Natija: ishlab chiqishga tayyor FRD.

- Ochiq savollarni yopish.
- Asosiy user flowlarni yozish.
- Role-permission matrix tuzish.
- Telegram bog'lash oqimini chizish.
- MVP va post-MVP chegarasini muzlatish.

### Phase 1 — Foundation

Natija: ishlaydigan SaaS skeleti.

- Repo va environment sozlash.
- Auth qo'shish.
- Tenant modelini yaratish.
- `super_admin`, `admin`, `teacher` rollarini kiritish.
- Tenant-scoped middleware/policy yozish.
- Uzbek/Russian i18n strukturasi.
- Audit uchun basic activity log qo'shish.

Acceptance criteria:

- Super Admin tenant yaratadi.
- Tenant Admin login qilib faqat o'z ma'lumotini ko'radi.
- Boshqa tenant ma'lumotiga URL orqali kirib bo'lmaydi.

### Phase 2 — Core education data

Natija: markaz/repetitor asosiy ma'lumotlarini yurita oladi.

- O'quvchi CRUD.
- Ota-ona CRUD.
- Ota-ona va o'quvchi bog'lash.
- O'qituvchi CRUD.
- Guruh CRUD.
- Guruhga o'quvchi va o'qituvchi biriktirish.
- Dars jadvali.

Acceptance criteria:

- Admin 1 ta guruh, 1 ta o'qituvchi, 5 ta o'quvchi yaratib dars jadvalini tuza oladi.
- Teacher faqat o'z guruhlarini ko'radi.

### Phase 3 — Attendance

Natija: davomat 2-3 bosishda belgilanadi.

- Bugungi darslar ro'yxati.
- Dars ichida o'quvchilar ro'yxati.
- Davomat statuslari.
- Tarixiy davomat ko'rinishi.
- Admin va Teacher uchun alohida permission.

Acceptance criteria:

- Teacher bugungi darsni ochib, barcha o'quvchilar davomatini 1 ekranda belgilaydi.
- Davomat saqlangandan keyin message event yaratiladi.

### Phase 4 — Payments

Natija: to'lov va qarzdorlik sodda kuzatiladi.

- To'lov kiritish.
- To'lov turi.
- Oy/guruh bo'yicha qarzdorlik.
- Kunlik tushum.
- O'quvchi kesimida balans.

Acceptance criteria:

- Admin o'quvchi uchun to'lov kiritadi.
- Qarzdorlar ro'yxati avtomatik yangilanadi.
- To'lov tasdig'i uchun message event yaratiladi.

### Phase 5 — Telegram integration

Natija: ota-onaga avtomatik xabar boradi.

- Bot sozlash.
- Parent `chat_id` bog'lash oqimi.
- Message template tizimi.
- Attendance, payment, debt reminder xabarlari.
- Queue + retry.
- Message log va delivery status.

Acceptance criteria:

- Ota-ona botga ulanadi.
- Davomat yoki to'lovdan keyin xabar queue orqali yuboriladi.
- Xabar yuborilmasa, status logda ko'rinadi va retry ishlaydi.

### Phase 6 — Reports and dashboard

Natija: Admin kunlik holatni tez ko'radi.

- Bugungi darslar.
- Bugungi davomat.
- Kunlik tushum.
- Qarzdorlar soni.
- Guruhlar kesimida qisqa statistikalar.

Acceptance criteria:

- Admin dashboarddan markazning bugungi holatini 10 soniyada tushunadi.

### Phase 7 — UI polish and responsive

Natija: premium, sodda va tez interfeys.

- Dashboard layout.
- Empty state, loading state, error state.
- Mobile/tablet moslashuv.
- Uzbek/Russian matnlarni tozalash.
- Form validation va microcopy.

Acceptance criteria:

- Yangi foydalanuvchi birinchi davomatni 3 daqiqadan kam vaqtda belgilaydi.
- Text overflow, layout overlap va noaniq buttonlar yo'q.

### Phase 8 — Hardening and release

Natija: v1 pilotga tayyor.

- Tenant isolation testlari.
- Permission testlari.
- Telegram failure testlari.
- Backup strategiyasi.
- Seed/demo tenant.
- Production deploy checklist.
- Monitoring va error logging.

Acceptance criteria:

- Kamida 2 ta tenant bilan cross-tenant access testdan o'tadi.
- Queue worker restart bo'lsa ham message yo'qolmaydi.
- Pilot markazda real foydalanishga tayyor bo'ladi.

---

## 7. Test strategiyasi

Majburiy testlar:

- Unit: domain calculation, payment balance, attendance status.
- Feature: auth, tenant access, role permission.
- Integration: Telegram message queue va retry.
- Browser/UI: asosiy oqimlar.

Eng muhim test:

- Tenant A foydalanuvchisi Tenant B o'quvchisi, guruhi, darsi, to'lovi yoki xabar logini hech qanday endpoint orqali ko'ra olmasligi kerak.

---

## 8. Production checklist

- `.env` production sozlamalari.
- PostgreSQL backup.
- Queue worker supervisor.
- Telegram webhook yoki polling strategiyasi.
- Error logging.
- HTTPS.
- Rate limiting.
- Admin account bootstrap.
- Demo data o'chirilgan.
- Seeded roles and permissions.

---

## 9. Tavsiya qilingan ish tartibi

1. FRD yoziladi.
2. Role-permission matrix yoziladi.
3. DB schema yoziladi.
4. Wireframe/user flow aniqlanadi.
5. Foundation kodlanadi.
6. Core data kodlanadi.
7. Davomat kodlanadi.
8. To'lov kodlanadi.
9. Telegram kodlanadi.
10. Hisobot, polish, hardening qilinadi.

---

## 10. Keyingi eng to'g'ri qadam

Keyingi hujjat sifatida `Dono_03_Functional_Requirements.md` yozilishi kerak. Unda har bir modul uchun quyidagilar aniq bo'ladi:

- kim ishlatadi;
- qaysi sahifada ishlaydi;
- qaysi maydonlar bor;
- qaysi validatsiyalar bor;
- qaysi eventlar yaratiladi;
- qaysi Telegram xabari ketadi;
- qanday edge-case bo'ladi.

FRD tugamasdan kod boshlash mumkin, lekin bu keyinchalik qayta ishlash xavfini oshiradi. Eng amaliy yo'l: avval 1-2 kun ichida FRD va DB schema tayyorlab, keyin foundationdan boshlash.

---

## 11. Screenshot review

Ko'rib chiqilgan fayllar:

- `screeshots/photo_2026-07-05_22-43-38.jpg` — Admin dashboard.
- `screeshots/photo_2026-07-05_22-43-44.jpg` — Teacher panel.

### Admin dashboard

Admin dashboard BRDdagi asosiy maqsadlarga mos: administrator bitta ekranda o'quvchilar, guruhlar, o'qituvchilar, bugungi darslar, tushum, davomat, eslatmalar va qarzdorlarni ko'ra oladi.

Kuchli tomonlari:

- Sidebar modullari MVP scope bilan mos: Dashboard, O'quvchilar, Guruhlar, Darslar, Davomat, To'lovlar, Xabarlar, Hisobotlar, Sozlamalar.
- Yuqoridagi KPI kartalar tez skan qilish uchun yaxshi.
- "Tezkor amallar" MVP uchun juda muhim: yangi o'quvchi, yangi guruh, davomat, to'lov, xabar.
- Qarzdorlar bloki biznes qiymatni to'g'ri ko'rsatadi.
- Bugungi darslar jadvali Admin uchun real operatsion markaz bo'la oladi.

Aniqlashtirish kerak:

- "Bugungi davomat" umumiy tenant bo'yichami yoki faqat yakunlangan darslar bo'yichami?
- "Bugungi tushum" faqat qabul qilingan to'lovlarmi yoki kutilgan to'lov ham qo'shiladimi?
- "Eslatmalar" qo'lda yaratiladimi yoki tizim eventlaridan avtomatik chiqadimi?
- Dars holatlari: `kutilmoqda`, `yakunlandi`, `bekor qilindi` kerak bo'ladi.
- Dashboarddagi qidiruv global qidiruv bo'lsa, qaysi entitylarni qidiradi: o'quvchi, ota-ona, guruh, o'qituvchi?

### Teacher panel

Teacher panel sodda va to'g'ri yo'nalishda: o'qituvchi uchun faqat bugungi darslar, jadval, davomat tarixi va uy vazifalari ko'rsatilgan. Bu BRDdagi "o'qituvchi faqat o'z darslari va davomatini ko'radi" talabiga mos.

Kuchli tomonlari:

- Asosiy CTA aniq: "Davomat qilish".
- O'qituvchi panelida moliya yo'q, bu permission modelni soddalashtiradi.
- Bugungi jadval va so'nggi davomat bir ekranda ko'rinadi.
- Dars kartalari mobilga moslashtirish uchun ham qulay.

Aniqlashtirish kerak:

- Teacher uy vazifasini yuboradimi yoki faqat ko'radimi?
- "Davomat tarixi" faqat o'z darslari bo'yichami?
- Teacher darsni yakunlay oladimi yoki faqat davomat saqlaydimi?
- Agar o'qituvchi bir nechta tenantda ishlasa, tenant switcher kerak bo'ladimi?

### UI implementation qoidalari

Bu mockuplardan kelib chiqib frontend uchun quyidagi qoidalarni saqlash kerak:

- Sidebar desktopda doimiy, mobile/tabletda collapsible bo'ladi.
- Dashboard kartalari responsive grid bo'ladi.
- KPI kartalar, table, reminder, debtor list alohida komponentlarga ajratiladi.
- Button va status ranglari semantik bo'ladi: success, warning, danger, info.
- Har bir karta uchun loading, empty va error state qilinadi.
- Matnlar Uzbek/Russian translation filelardan olinadi.
- Teacher panel Admin paneldan alohida route/layout bo'lishi mumkin, lekin component system umumiy qoladi.

### FRDga qo'shiladigan ekranlar

Screenshotlardan kelib chiqib FRDda kamida quyidagi sahifalar alohida yozilishi kerak:

1. Admin Dashboard
2. Teacher Dashboard
3. Today's Lessons
4. Attendance Taking Screen
5. Attendance History
6. Students
7. Groups
8. Payments
9. Debtors
10. Messages
11. Settings

Har bir sahifa uchun fields, actions, permissions, empty state, validation va Telegram eventlar aniq yoziladi.
