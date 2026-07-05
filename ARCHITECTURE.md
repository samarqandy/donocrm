# Dono Architecture

## Maqsad

Dono arxitekturasi tez ishlaydigan, ishonchli va keyinchalik PostgreSQL/real auth/Telegram workerga ko'chirish oson bo'ladigan qilib ajratildi.

## Qatlamlar

### HTTP

`src/http`

- request routing
- JSON body parsing
- JSON response
- static frontend serving

HTTP qatlam biznes logika bilmaydi. U faqat requestni service qatlamiga beradi.

### Service

`src/services`

- role checks
- validation
- use-case logic
- attendance/payment/message flow

Masalan, to'lov yaratilganda debt kamayadi va Telegram message queuega yoziladi.

### Repository

`src/repositories`

- SQL querylar
- transactionlar
- DB mapping

Backend PostgreSQLga ko'chirilganda asosan shu qatlam almashtiriladi.

### Database

`src/db`

- SQLite client
- schema
- initial seed

Hozirgi baza: `data/dono.sqlite`.

## Nima yaxshilandi

- JSON fayl DB o'rnini SQLite oldi.
- Transactionlar qo'shildi.
- Schema constraintlar qo'shildi.
- API bitta fayldan modullarga ajratildi.
- Validation service qatlamga chiqdi.
- Business logic service qatlamda.
- Persistence repository qatlamda.
- Static file path resolve bilan himoyalandi.

## Hali production uchun kerak

- Real auth/session.
- Role va tenantni headerdan emas, sessiondan olish.
- PostgreSQL migration.
- Real Telegram Bot API.
- Queue worker.
- Full CRUD.
- Automated tests.
