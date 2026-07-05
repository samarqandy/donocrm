# AlfaCRM — Senior Product & Technical Audit

**Audit sanasi:** 2026-07-06
**Audit obyekti:** `https://alfacrm.pro/`
**Maqsad:** Dono loyihasi uchun raqobatchi platformani tahlil qilish va MVP/top-platforma yo'nalishini aniqlash.

---

## 1. Executive summary

AlfaCRM ta'lim markazlari uchun keng qamrovli, yetilgan CRM platforma. U faqat davomat va to'lov emas, balki sotuv voronkasi, analitika, moliya, o'qituvchi ish haqi, abonementlar, mijoz kabineti, online to'lov, integratsiyalar, filiallar, ichki chat, hujjatlar, vazifalar va ko'plab avtomatlashtirishlarni qamrab oladi.

Dono uchun asosiy xulosa:

- AlfaCRM bilan "funksiya soni" bo'yicha raqobat qilish MVP bosqichida noto'g'ri.
- Dono kichik markazlar va repetitorlar uchun "eng sodda, eng tez, Telegram-first" pozitsiyasini olishi kerak.
- AlfaCRM kuchli, lekin juda katta tizim. Dono kuchli tomoni soddalik, o'zbek bozori, Telegram UX va 2-3 daqiqada tushunarli oqim bo'lishi kerak.

---

## 2. AlfaCRM positioning

AlfaCRM o'zini o'quv markazlari uchun daromadni oshiruvchi CRM sifatida ko'rsatadi. Landing sahifasidagi asosiy va'dalar:

- foydani oshirish;
- xodimlarni nazorat qilish;
- o'qituvchilarga ish haqi hisoblash;
- sodiqlik tizimi;
- o'quvchi mobil ilovasi;
- online QR to'lov;
- bepul support va oddiy sozlash.

Bu positioning katta yoki o'sishga tayyor o'quv markazlariga qaratilgan. Yakka repetitor yoki 20-50 o'quvchili kichik markaz uchun bu imkoniyatlarning ko'pi ortiqcha bo'lishi mumkin.

---

## 3. Target segment

AlfaCRM ko'plab vertikallarni qamrab oladi:

- bolalar rivojlanish markazlari;
- til maktablari;
- musiqa maktablari;
- dasturlash kurslari;
- sport markazlari;
- imtihonga tayyorlash;
- robototexnika;
- mental arifmetika;
- san'at maktablari;
- beauty education.

Bu yondashuv universal CRM modelini talab qiladi: ko'p sozlama, ko'p modul, turli jarayonlarga moslashish. Dono ham universal bo'lishi mumkin, lekin v1 da universal platforma emas, universal minimal yadro qilinishi kerak.

Tavsiya:

- Dono v1: repetitor + kichik markaz.
- Dono v2: filial, katta markaz, murakkab moliya.
- Dono v3: marketplace/integratsiyalar/AI.

---

## 4. Feature audit

### 4.1. Sales CRM

AlfaCRM kiruvchi leadlarni telefon, sayt, ijtimoiy tarmoqlar va emaildan yig'ib, sotuv voronkasiga tushirishni taklif qiladi.

Dono uchun qaror:

- MVPga sales CRM kiritilmaydi.
- Keyinchalik "leadlar" moduli bo'lishi mumkin, lekin birinchi versiyada fokus: o'quvchi, guruh, davomat, to'lov, Telegram.

### 4.2. Dashboard and analytics

AlfaCRM moslashtiriladigan dashboard, grafiklar va ko'rsatkichlarni taklif qiladi. Analitika katta markazlar uchun muhim.

Dono uchun qaror:

- MVP dashboard faqat operatsion bo'ladi: bugungi darslar, davomat, tushum, qarzdorlar, yuborilmagan xabarlar.
- Custom dashboard MVPga kiritilmaydi.

### 4.3. Education process

AlfaCRM abonementlar, darslar, hisobdan yechish, to'lovlar, shartnomalar va o'zgarishlar tarixini yuritadi.

Dono uchun qaror:

- MVPda "abonement engine" emas, soddalashtirilgan oy/guruh to'lovi bo'ladi.
- Har bir dars uchun davomat va optional izoh saqlanadi.
- Murakkab "sotib olingan darslar soni", "freeze", "make-up lesson" keyingi bosqichga qoladi.

### 4.4. Finance

AlfaCRM daromad/xarajat, kassalar, hisoblar, moliyaviy ko'rsatkichlar, CAC/LTV/ARPU, churn kabi metrikalarni eslatadi.

Dono uchun qaror:

- MVP: to'lov qabul qilish, qarzdorlar, kunlik tushum.
- v2: xarajatlar, kassa, oylik hisobot.
- v3: LTV, ARPU, churn, cohort analytics.

### 4.5. Parent/student cabinet

AlfaCRM mijoz kabineti, mobil ilova, jadval, uy vazifasi, to'lov, yangilik, chat va progress ko'rinishini beradi.

Dono uchun qaror:

- MVPda parent cabinet bo'lmaydi.
- Dono farqi: ota-ona hech narsa o'rnatmasdan Telegramdan xabar oladi.
- Keyinchalik PWA parent link qilish mumkin, lekin Telegram-first qolishi kerak.

### 4.6. Integrations

AlfaCRM knowledge base bo'yicha telefoniyalar, SMS provayderlar, ekvayringlar, messenjyerlar, sayt builderlar, CRMlar, API kabi ko'p integratsiyalarni qo'llab-quvvatlaydi.

Dono uchun qaror:

- MVPda faqat Telegram Bot API.
- Keyingi integratsiya prioriteti O'zbekiston uchun: Click, Payme, Uzum Bank, Eskiz SMS.
- Integratsiya arxitekturasi boshidan event/queue asosida bo'lishi kerak.

### 4.7. Roles and access

AlfaCRM xodimlar uchun alohida kirish darajalarini ta'kidlaydi.

Dono uchun qaror:

- MVP rollari: Super Admin, Admin, Teacher.
- Teacher moliyani ko'rmaydi.
- Har bir request tenant scope orqali o'tadi.

---

## 5. Product strengths

AlfaCRMning kuchli tomonlari:

1. Ta'lim markazlari jarayonini chuqur tushungan.
2. Modul qamrovi katta.
3. Integratsiyalar ko'p.
4. Knowledge base juda keng.
5. Customer cabinet va mobile app bor.
6. Moliyaviy hisob va abonementlar rivojlangan.
7. Katta markazlar uchun filial, xodim, support, licensing kabi ehtiyojlar yopilgan.
8. Social proof kuchli: ko'p tashkilotlar ishlatayotgani ko'rsatilgan.

Dono uchun saboq:

- Product faqat kod emas; onboarding, support, help center, demo flow va trust ham kerak.
- Investor demo uchun "bizda nima bor" emas, "foydalanuvchi 3 daqiqada nima qiladi" ko'rsatilishi kerak.

---

## 6. Product weaknesses / opportunity

AlfaCRMning ehtimoliy zaif joylari:

1. Juda ko'p modul kichik markaz uchun murakkab ko'rinishi mumkin.
2. Sales CRM, abonement, moliya, integratsiya va cabinet birga kelgani sababli learning curve yuqori bo'lishi mumkin.
3. O'zbekiston bozori uchun lokal to'lov, Telegram madaniyati, Uzbek/Russian UX alohida moslanmagan bo'lishi mumkin.
4. Parent cabinet/mobil ilova ota-onadan qo'shimcha odat talab qiladi.
5. Kichik repetitor uchun narx va sozlash jarayoni og'ir tuyulishi mumkin.

Dono opportunity:

- "AlfaCRM kabi katta emas, lekin sizga kerak 3 ishni juda tez qiladi."
- "Telegram orqali ota-onaga avtomatik xabar."
- "O'zbek va rus tilida, mahalliy o'quv markazlari uchun."
- "1 kunda ishga tushadi."

---

## 7. UX audit

Landing sahifasi ko'p feature va trust signal beradi. Biroq Dono uchun investor demo landingdan ko'ra mahsulotning ishlash oqimini ko'rsatishi kuchliroq.

Dono UI yo'nalishi:

- Admin birinchi ekranda bugungi holatni ko'radi.
- Teacher birinchi ekranda faqat bugungi darslar va "Davomat qilish" tugmasini ko'radi.
- Ota-ona uchun interface emas, Telegram xabar namunasi ko'rsatiladi.
- Har bir katta amal 2-3 bosqichdan oshmasligi kerak.

MVP ekran prioriteti:

1. Admin Dashboard
2. Today's Lessons
3. Attendance Taking
4. Payments
5. Debtors
6. Telegram Message Log
7. Teacher Dashboard

---

## 8. Technical architecture lessons

AlfaCRM darajasiga chiqish uchun Dono arxitekturasi boshidan to'g'ri bo'lishi kerak:

- Multi-tenant DB model.
- Role-permission policy.
- Event-driven notification system.
- Queue and retry.
- Message logs.
- Audit logs.
- Translation/i18n.
- Integration adapters.
- Billing-ready tenant model.

MVPda ham bu prinsiplar buzilmasligi kerak. Kod keyin tashlab yuboriladigan prototip bo'lsa ham, haqiqiy platforma arxitekturasi alohida loyihalanadi.

---

## 9. Dono vs AlfaCRM positioning

| Yo'nalish | AlfaCRM | Dono MVP |
|---|---|---|
| Segment | Keng o'quv markazlari | Kichik markaz/repetitor |
| Fokus | To'liq CRM/ERPga yaqin | Davomat, to'lov, Telegram |
| Parent access | Cabinet/mobile app | Telegram xabar |
| Sales CRM | Bor | Yo'q |
| Finance | Keng | Sodda |
| Integratsiya | Juda ko'p | Telegram |
| Sozlash | Moslashuvchan, ko'p parametr | Minimal sozlama |
| Differentiator | Keng funksionallik | Soddalik va lokal bozor |

---

## 10. MVP uchun qat'iy tavsiyalar

MVPda qilinadi:

- Admin dashboard
- Student CRUD
- Parent phone/Telegram link modeli
- Group CRUD
- Lesson schedule
- Attendance
- Payment
- Debtors
- Telegram message queue/log
- Teacher panel
- Uzbek/Russian UI
- Tenant isolation

MVPda qilinmaydi:

- Sales funnel
- Parent cabinet
- Mobile app
- Payroll
- Advanced finance
- Loyalty points
- Online payment
- Multi-branch
- Custom dashboard
- Internal chat
- AI

---

## 11. Investor demo narrative

Demo quyidagi hikoya bilan ko'rsatilishi kerak:

1. "Kichik markaz bugun nima bo'layotganini dashboardda ko'radi."
2. "O'qituvchi darsni ochadi va 2-3 bosishda davomatni belgilaydi."
3. "Ota-onaga Telegram orqali avtomatik xabar ketadi."
4. "Admin to'lovni kiritadi, qarzdorlik kamayadi."
5. "Qarzdor ota-onalarga eslatma Telegram orqali navbatga tushadi."
6. "Bularning hammasi Uzbek/Russian va kichik markaz uchun ortiqcha CRM murakkabligisiz ishlaydi."

---

## 12. Roadmap

### MVP

- Real backend.
- Tenant isolation.
- Admin/Teacher.
- Attendance.
- Payments.
- Telegram.
- Basic dashboard.

### v1

- Production deploy.
- Real Telegram Bot API.
- Message retry.
- Import from Excel.
- Payment monthly obligations.
- Better reports.

### v2

- Local payment integrations: Payme/Click/Uzum.
- Eskiz SMS fallback.
- Parent magic link/PWA.
- Branch support.
- Payroll basic.

### v3

- Sales funnel.
- Custom dashboard.
- Advanced finance.
- Open API.
- Integrations marketplace.
- AI assistant.

---

## 13. Final senior recommendation

Dono AlfaCRMni nusxalamasligi kerak. AlfaCRM katta va yetilgan CRM. Dono esa kichik markazlar uchun "kundalik ishni tez bajaradigan, Telegram-first, minimal SaaS" bo'lishi kerak.

Eng to'g'ri strategiya:

- MVPni tor va ishlaydigan qiling.
- Tenant isolation va Telegramni boshidan to'g'ri qiling.
- UXni AlfaCRMdan ham sodda qiling.
- Investor demo uchun 3 oqimni mukammal qiling: davomat, to'lov, xabar.
- Keyin bozor signaliga qarab katta modullarni qo'shing.

AlfaCRMdan olinadigan eng katta saboq: ta'lim CRMda oxir-oqibat modullar ko'payadi. Dono muvaffaqiyatli bo'lishi uchun modullar ko'paygan taqdirda ham oddiylikni yo'qotmaydigan arxitektura va UX kerak.
