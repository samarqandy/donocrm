# Dono Sidebar Audit

**Sana:** 2026-07-06  
**Audit scope:** Admin sidebar bo'limlari va asosiy actionlar

---

## Xulosa

Sidebar bo'limlari render bo'ladi va asosiy APIlar ishlaydi. Audit vaqtida bitta real backend xatosi va bir nechta UI/UX funksional kamchilik topildi.

Tuzatilganlar:

- `Darslar -> Yangi dars` API 500 qaytarayotgan edi. Sabab `date: undefined` default `today()` ustidan bosib ketgan. Tuzatildi.
- Teacher rejimida `Darslar/Davomat` sahifalari hamma o'qituvchilar darslarini ko'rsatayotgan edi. Endi faqat o'z darslari ko'rinadi.
- Topbar search input ishlamayotgan edi. Endi list/table sahifalarda filter qiladi.

Toza DB holati:

- 6 o'quvchi
- 5 guruh
- 0 payment
- 0 audit log

---

## Bo'limlar bo'yicha audit

### Dashboard

Holat: ishlaydi.

Ishlaydigan qismlar:

- KPI kartalar chiqadi.
- Bugungi darslar ro'yxati chiqadi.
- Qarzdorlar ro'yxati chiqadi.
- Quick actions modal ochadi.
- Telegram queue kartasi chiqadi.

Kamchiliklar:

- KPI statistikalar juda basic.
- Dashboard filter/date range yo'q.
- Search dashboard ichidagi kartalarga ta'sir qilmaydi.

### O'quvchilar

Holat: ishlaydi, lekin CRUD to'liq emas.

Ishlaydigan qismlar:

- Ro'yxat chiqadi.
- Yangi o'quvchi qo'shish ishlaydi.
- Search filter ishlaydi.
- Validation bo'sh `name`ni bloklaydi.

Kamchiliklar:

- Edit yo'q.
- Delete/archive yo'q.
- Student detail page yo'q.
- Parent alohida entity emas.

### Guruhlar

Holat: ishlaydi, lekin CRUD to'liq emas.

Ishlaydigan qismlar:

- Ro'yxat chiqadi.
- Yangi guruh qo'shish ishlaydi.
- Teacher select bor.
- Search filter ishlaydi.

Kamchiliklar:

- Edit/delete yo'q.
- Guruhga o'quvchi biriktirish alohida UI yo'q.
- Schedule pattern yo'q.

### Darslar

Holat: tuzatildi, endi ishlaydi.

Topilgan xato:

- `POST /api/lessons` 500 qaytarayotgan edi.

Sabab:

- Repositoryda `date: today(), ...payload` tartibi sabab `payload.date === undefined` default sanani o'chirib yuborgan.

Tuzatish:

- `date: payload.date || today()` qilindi.

Kamchiliklar:

- Dars edit/delete/cancel yo'q.
- Calendar view yo'q.
- Recurring schedule yo'q.

### Davomat

Holat: ishlaydi.

Ishlaydigan qismlar:

- Lesson ichida o'quvchilar chiqadi.
- Statuslar: `present`, `absent`, `late`, `excused`.
- Saqlanganda attendance yoziladi.
- Lesson `completed` bo'ladi.
- Telegram queue message yaratiladi.
- Teacher faqat o'z darsiga davomat saqlay oladi.

Kamchiliklar:

- Attendance history alohida view emas.
- Oldingi davomatni qayta ochganda saqlangan status UIga yuklanmaydi.
- Empty lesson uchun UX yo'q.

### To'lovlar

Holat: ishlaydi.

Ishlaydigan qismlar:

- To'lov qo'shish ishlaydi.
- Manfiy/0 amount backendda bloklanadi.
- Qarzdorlik kamayadi.
- Telegram queue message yaratiladi.
- Teacher payment qo'sha olmaydi.

Kamchiliklar:

- Invoice/oylik majburiyat modeli yo'q.
- Refund/void yo'q.
- Receipt yo'q.
- Kassa/payment method hisobotlari yo'q.

### Telegram

Holat: ichki queue/log ishlaydi, real Telegram emas.

Ishlaydigan qismlar:

- Manual xabar qo'shish ishlaydi.
- Attendance/paymentdan avtomatik queue yaratiladi.
- Queue processing tugmasi statusni `sent` qiladi.

Kamchiliklar:

- Real Telegram Bot API ulanmagan.
- Parent `chat_id` bog'lash yo'q.
- Retry/backoff real emas.
- Failed reason yo'q.

### Leadlar

Holat: ishlaydi, minimal.

Ishlaydigan qismlar:

- Lead ro'yxati chiqadi.
- Yangi lead qo'shish ishlaydi.
- Status: `new`, `contacted`, `converted`.
- Search filter ishlaydi.

Kamchiliklar:

- Pipeline board yo'q.
- Statusni inline o'zgartirish yo'q.
- Leadni studentga convert qilish yo'q.
- Source analytics yo'q.

### Hisobotlar

Holat: basic ishlaydi.

Ishlaydigan qismlar:

- Revenue, debt, queued messages, attendance cardlari bor.
- Audit log chiqadi.

Kamchiliklar:

- Date range yo'q.
- Export yo'q.
- Group/teacher/student filter yo'q.
- Attendance/payment chart yo'q.
- Audit log bo'sh bo'lsa empty state yo'q.

### Sozlamalar

Holat: read-only ishlaydi.

Ishlaydigan qismlar:

- Tenant nomi, status, plan, Telegram bot ko'rsatiladi.
- Dono imkoniyatlari ro'yxati chiqadi.

Kamchiliklar:

- Hech narsa sozlab bo'lmaydi.
- Tenant info edit yo'q.
- Telegram bot token sozlash yo'q.
- Til default sozlamasi yo'q.
- User/role management yo'q.

---

## Topilgan muhim muammolar

1. Dars yaratish 500 qaytarayotgan edi — tuzatildi.
2. Teacher dars sahifasida boshqa o'qituvchilar darslari ko'rinayotgan edi — tuzatildi.
3. Search input ishlamayotgan edi — list/table filter qo'shildi.
4. Sozlamalar sahifasi nomiga mos emas, hozir faqat read-only info.
5. Telegram bo'limi real Telegram integratsiya emas.
6. CRUD ko'p joyda faqat create/list darajasida.

---

## Keyingi tavsiya

Eng avval quyidagilarni qilish kerak:

1. Sozlamalar sahifasini real ishlaydigan qilish: tenant info, default language, Telegram bot token, users/roles.
2. Full CRUD: edit/archive/detail.
3. Attendance historyni alohida ishlaydigan qilish.
4. Lead pipeline va lead -> student conversion.
5. Real Telegram Bot API va parent linking.
