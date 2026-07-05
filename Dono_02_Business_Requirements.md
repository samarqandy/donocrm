# Dono — Business Requirements Document (BRD)

**Hujjat:** 2 / 9 — Business Requirements
**Loyiha:** Dono — kichik o'quv markazlari va repetitorlar uchun ta'lim boshqaruv platformasi
**Versiya:** 1.0 (qoralama)
**Holat:** Ko'rib chiqilmoqda
**Oldingi hujjat:** 1. Project Vision
**Keyingi hujjat:** 3. Functional Requirements (FRD)

---

## 1. Hujjat haqida

Bu hujjat Dono platformasining **biznes talablarini** belgilaydi — ya'ni *nima* qurilishi va *nima uchun* qurilishi. Texnik yechim (*qanday* qurilishi) keyingi hujjatlarda ochib beriladi.

Har bir talab noyob ID bilan raqamlangan (masalan, `BR-01`), toki keyingi FRD, ma'lumotlar bazasi va UI hujjatlarida ularga ishora qilish oson bo'lsin.

---

## 2. Qisqacha mazmun (Executive Summary)

Dono — kichik o'quv markazlari va xususiy repetitorlar uchun mo'ljallangan **minimalistik, tez va premium ko'rinishli SaaS platforma**. Uning vazifasi murakkab CRM yaratish emas, balki kundalik uchta ishni — **davomat, to'lovlar va ota-onalar bilan aloqa**ni — maksimal soddalik bilan avtomatlashtirish.

Platforma **ko'p-ijorachilik** (multi-tenant) tamoyilida ishlaydi: bitta tizim ichida ko'plab mustaqil akkauntlar (repetitorlar yoki markazlar) yashaydi, ammo ularning ma'lumotlari bir-biridan to'liq ajratilgan. Akkauntlar **faqat Super Admin** (platforma egasi) tomonidan qo'lda yaratiladi — ochiq ro'yxatdan o'tish yo'q.

Ota-onalar uchun alohida ilova yoki kabinet bo'lmaydi. Barcha muhim xabarlar **Telegram** orqali avtomatik yetkaziladi — bu platformaning asosiy farqlovchi ustunligi.

---

## 3. Biznes maqsadlari (Business Objectives)

| ID | Maqsad |
|----|--------|
| BO-01 | O'qituvchi/administratorning kundalik ma'muriy ishini (davomat, to'lov, xabar) sezilarli darajada tezlashtirish. |
| BO-02 | Ota-onalar bilan aloqani avtomatlashtirish orqali qo'ng'iroq va qo'lda xabar yuborishni yo'q qilish. |
| BO-03 | Foydalanuvchi tizimni 2–3 daqiqada, qo'llanmasiz tushunib olishi. |
| BO-04 | Bitta platformada turli xil markaz turlarini (til, matematika, IT, shaxmat, mental arifmetika) qo'llab-quvvatlash. |
| BO-05 | Kelajakda pullik obuna modeliga o'tishga tayyor, ammo hozircha bepul tarqatiladigan arxitektura yaratish. |

---

## 4. Muammo bayoni (Problem Statement)

Bozordagi mavjud ta'lim CRM tizimlari kichik markazlar uchun quyidagi muammolarga ega:

- Juda murakkab va ortiqcha funksiyalarga to'la (ERP darajasida).
- O'rganish chegarasi baland — yangi xodim qo'llanmasiz ishlata olmaydi.
- Ota-onalar bilan aloqa alohida ilova o'rnatishni talab qiladi.
- Interfeys eskirgan, vizual jihatdan charchatuvchi.

Natijada kichik markazlar va yakka repetitorlar hamon davomat va to'lovlarni **qo'lda daftar yoki Excel**da yuritadi, ota-onalarga esa **birma-bir qo'lda xabar** yozadi. Bu vaqtni yeydi va xatolarga olib keladi.

---

## 5. Taklif etilayotgan yechim (Proposed Solution)

Dono uchta asosiy ishni mukammal bajaradigan, qolgan hamma narsani shu uchtaga bo'ysundiradigan sodda platforma bo'ladi:

1. **Davomat** — bir necha bosishda belgilanadi.
2. **To'lovlar** — qabul qilinadi, qarzdorlik kuzatiladi.
3. **Ota-onalar bilan aloqa** — Telegram orqali avtomatik.

Interfeys Apple, Linear, Notion, Stripe darajasidagi zamonaviy SaaS ko'rinishida bo'ladi: ko'p oq joy, yumaloq kartalar, minimal ranglar, soft shadow, premium tipografiya.

---

## 6. Qamrov (Scope)

### 6.1. Qamrov ichida (In Scope) — v1

| ID | Talab |
|----|-------|
| BR-01 | **Super Admin paneli** — platforma egasi akkauntlarni (repetitor/markaz) qo'lda yaratadi, boshqaradi, faollashtiradi/o'chiradi. |
| BR-02 | **Akkaunt (ijorachi) paneli — Admin** — o'quvchilar, guruhlar, darslar, davomat, to'lovlar, xabarlar boshqaruvi (1-rasmdagi dashboard). |
| BR-03 | **O'qituvchi/Davomat paneli** — o'qituvchi faqat o'z darslari va davomatini ko'radi va belgilaydi (2-rasmdagi panel). |
| BR-04 | **Universal akkaunt tuzilishi** — bitta akkaunt ham yakka repetitor (o'zi ham admin, ham o'qituvchi), ham markaz (1 admin + bir necha o'qituvchi) sifatida ishlashi. |
| BR-05 | **Markaz turi tanlash** — til/matematika/IT/shaxmat/mental arifmetika va boshqalar shunchaki sozlama, alohida mahsulot emas. |
| BR-06 | **Davomat moduli** — kelди/kelmadi belgilash, kunlik/tarixiy ko'rinish. |
| BR-07 | **To'lovlar moduli** — to'lov qabul qilish, qarzdorlik ro'yxati, kunlik tushum. |
| BR-08 | **Telegram integratsiyasi** — davomat, qarzdorlik, to'lov tasdig'i, uy vazifasi, eslatma, tabrik va yangiliklarni ota-onaga avtomatik yuborish. |
| BR-09 | **Ko'p tillilik** — interfeys Uzbek (lotin) va Rus tillarida. |
| BR-10 | **Ma'lumotlar izolyatsiyasi** — har bir akkauntning ma'lumoti boshqalardan to'liq ajratilgan (multi-tenancy). |
| BR-11 | **Hisobotlar (asosiy darajada)** — davomat va to'lov bo'yicha sodda ko'rsatkichlar. |

### 6.2. Qamrovdan tashqari (Out of Scope) — v1 da yo'q

- Ota-onalar uchun alohida veb-kabinet yoki mobil ilova (faqat Telegram).
- Ochiq (self-service) ro'yxatdan o'tish — akkaunt faqat Super Admin orqali.
- Pullik obuna / hisob-kitob (billing) — arxitektura tayyor, ammo hozircha bepul.
- Online video-dars, test/imtihon platformasi, kontent boshqaruvi.
- Murakkab moliyaviy hisobot, buxgalteriya, oylik maosh hisobi.
- Uchinchi tomon integratsiyalari (Telegramdan tashqari).

> **Eslatma:** "Out of Scope" — bu "hech qachon" emas. Bular kelajakdagi versiyalar uchun, ammo v1 arxitekturasi ularga xalaqit bermasligi kerak.

---

## 7. Foydalanuvchilar va rollar (yuqori daraja)

Batafsil ruxsatlar 4-hujjatda (User Roles & Permissions) ochiladi. Bu yerda faqat umumiy manzara:

| Rol | Kim | Nimani ko'radi |
|-----|-----|----------------|
| **Super Admin** | Platforma egasi (siz) | Barcha akkauntlar, akkaunt yaratish/boshqarish. |
| **Admin** | Markaz egasi yoki repetitorning o'zi | O'z akkaunti ichidagi hamma narsa. |
| **O'qituvchi** | Markazdagi o'qituvchi (yoki repetitorning o'zi) | Faqat o'z darslari va davomati. |
| **Ota-ona** | Rol emas — kabinetsiz | Faqat Telegram orqali xabar oladi. |

**Universal tuzilma qanday ishlaydi:** yakka repetitorda bitta shaxs Admin va O'qituvchi rolini birga oladi; markazda esa Admin bir kishi, O'qituvchilar bir nechta bo'ladi. Ma'lumotlar bazasi ikkala holatni bitta modelda qamrab oladi.

---

## 8. Biznes model

| ID | Talab |
|----|-------|
| BR-12 | v1 da platforma **bepul** tarqatiladi; akkauntlar Super Admin tomonidan qo'lda ulanadi. |
| BR-13 | Arxitektura kelajakda **obuna/to'lov modeli** qo'shishga tayyor bo'lishi kerak (akkaunt darajasida holat, reja, muddat maydonlari nazarda tutiladi), ammo v1 da faol bo'lmaydi. |

---

## 9. Funksional bo'lmagan talablar (Non-Functional Requirements)

| ID | Kategoriya | Talab |
|----|-----------|-------|
| NFR-01 | Foydalanish qulayligi | Yangi foydalanuvchi qo'llanmasiz, 2–3 daqiqada asosiy oqimni tushunishi. |
| NFR-02 | Ishlash tezligi | Sahifalar tez ochilishi, asosiy amallar sezilarli kutishsiz bajarilishi. |
| NFR-03 | Dizayn | Premium SaaS ko'rinish: ko'p oq joy, yumaloq kartalar, soft shadow, minimal rang, premium tipografiya (1- va 2-rasmlardagi uslub — mos'lik majburiy). |
| NFR-04 | Til | To'liq Uzbek (lotin) va Rus tillarini qo'llab-quvvatlash; til almashtirish oson. |
| NFR-05 | Xavfsizlik | Akkauntlar orasida ma'lumotlar qat'iy izolyatsiyasi; bir akkaunt boshqasining ma'lumotini hech qachon ko'ra olmasligi. |
| NFR-06 | Ishonchlilik | Telegram xabarlari yetkazilishi ishonchli bo'lishi; yuborilmagan xabar yo'qolib qolmasligi (qayta urinish mexanizmi). |
| NFR-07 | Kengaytiriluvchanlik | v1 kichik markazlarga (20–100 o'quvchi), keyinchalik 500+ o'quvchiga mo'ljallangan bo'lsin. |
| NFR-08 | Moslashuvchanlik (responsive) | Panellar desktopda mukammal, planshet/mobil ekranda ham ishlashi. |

---

## 10. Ko'p-ijorachilik tamoyili (Multi-Tenancy) — asosiy arxitektura qoidasi

Bu Dono'ning eng muhim texnik tamoyili va birinchi kundanoq singdirilishi shart:

- Har bir **akkaunt = bitta ijorachi (tenant)**.
- Barcha ma'lumotlar (o'quvchi, guruh, dars, to'lov, xabar) o'z akkauntiga bog'langan bo'ladi.
- Bir akkaunt boshqasining ma'lumotini **hech qanday holatda** ko'ra olmaydi.
- Super Admin — yagona rol bo'lib, barcha ijorachilar ustidan turadi.

Bu tamoyilni keyinga qoldirish keyinchalik butun bazani qayta ishlashni talab qiladi, shuning uchun u BRD darajasida majburiy qoida sifatida belgilanadi.

---

## 11. Muvaffaqiyat mezonlari (Success Metrics)

| ID | Ko'rsatkich |
|----|-------------|
| SM-01 | Yangi foydalanuvchi qo'llanmasiz birinchi davomatni 3 daqiqada belgilay olishi. |
| SM-02 | Davomat belgilash 2–3 bosishda bajarilishi. |
| SM-03 | Ota-onaga xabar avtomatik ketishi — qo'lda yozish 0 ga tushishi. |
| SM-04 | Foydalanuvchilar tizimni "sodda va tez" deb baholashi (sifat mezoni). |

---

## 12. Cheklovlar va taxminlar (Constraints & Assumptions)

**Cheklovlar:**
- Ota-onalar bilan aloqa faqat Telegram orqali (v1 da SMS/email yo'q).
- Akkaunt yaratish faqat qo'lda, Super Admin orqali.

**Taxminlar:**
- Ota-onalarda Telegram bor va bot bilan bog'lanishga tayyor.
- Markazlar kichik (20–100 o'quvchi) va murakkab moliyaviy hisobga muhtoj emas.
- Foydalanuvchilar asosan Uzbek yoki Rus tilida ishlaydi.

---

## 13. Risklar (Risks)

| ID | Risk | Ta'sir | Yumshatish yo'li |
|----|------|--------|------------------|
| R-01 | **Telegram bog'lash** — ota-onani `chat_id` bilan bog'lash chalkash bo'lishi. | Yuqori (butun aloqa shu bo'g'inda). | FRD/UX bosqichida bog'lash oqimini alohida, juda sodda loyihalash. |
| R-02 | **Xabar yetkazilmasligi** — ota-ona botni bloklagan yoki ulanmagan. | O'rta. | Yetkazilmagan xabar holatini kuzatish, adminga ko'rsatish. |
| R-03 | **Universal tuzilma murakkablashuvi** — yakka + markazni bitta modelda ushlash. | O'rta. | Ma'lumotlar bazasini soddadan boshlab, rollarni moslashuvchan qilish. |
| R-04 | **Soddalikni yo'qotish** — "to'liq versiya" istagi ortiqcha funksiyaga olib borishi. | Yuqori (mahsulot falsafasiga zid). | Har bir yangi funksiyani "3 asosiy ishga xizmat qiladimi?" savoli bilan filtrlash. |

---

## 14. Ochiq savollar (Open Questions)

Bu savollar keyingi hujjatlardan oldin hal qilinishi kerak:

| ID | Savol |
|----|-------|
| OQ-01 | Guruh nomi mockuslarда farq qildi (Admin: "IT Pro", O'qituvchi: "IT Basic") — bir guruhmi yoki ikki xilmi? |
| OQ-02 | Bitta ota-ona bir nechta bolaga ega bo'lsa, Telegramda qanday ko'rinadi (bitta chat, ko'p bola)? |
| OQ-03 | To'lov naqd/karta/o'tkazma turlari ajratiladimi yoki shunchaki "to'landi" holatimi? |
| OQ-04 | Davomat holatlari faqat "keldi/kelmadi"mi yoki "kechikdi", "sababli" ham bo'ladimi? |
| OQ-05 | O'qituvchi to'lovlarni ko'ra oladimi yoki bu faqat Adminga tegishlimi? |

---

## 15. Keyingi qadam

Ushbu BRD tasdiqlangach, **3-hujjat: Functional Requirements (FRD)**ga o'tamiz — unda har bir funksiya (davomat, to'lov, Telegram, akkaunt yaratish va h.k.) **qadam-baqadam qanday ishlashi** batafsil yoziladi. Yuqoridagi ochiq savollar (OQ-01…OQ-05) FRD boshida hal qilinadi.

---

*Dono — sodda, tez, chiroyli.*
