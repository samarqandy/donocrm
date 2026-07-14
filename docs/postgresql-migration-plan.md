# DonoCRM SQLite -> PostgreSQL Migration Plan

## 1. Tayyorlov

- Hozirgi SQLite faylidan backup oling: `data/dono.sqlite`.
- `docs/openapi.yaml` bo'yicha frontend-backend contractni freeze qiling.
- `schema_migrations` jadvalida barcha versioned migrationlar qo'llanganini tekshiring.
- Production uchun PostgreSQL database, user va alohida schema yarating.

## 2. Schema Mapping

SQLite va PostgreSQL farqlari:

- `TEXT` IDlar PostgreSQLda ham `TEXT` sifatida qoladi.
- `INTEGER` boolean fieldlar `BOOLEAN`ga bosqichma-bosqich o'tkaziladi yoki compatibility uchun `INTEGER` qoldiriladi.
- `datetime('now')` ishlatilgan SQLlar repository qatlamida parametrli `now()` qiymatiga almashtiriladi.
- Partial unique indexlar PostgreSQLda `WHERE idempotency_key IS NOT NULL AND idempotency_key != ''` ko'rinishida qayta yoziladi.

## 3. Data Export/Import

Bosqichlar:

1. SQLite read-only maintenance oynasiga o'tkaziladi.
2. Har bir jadval CSV/JSONL formatida export qilinadi.
3. PostgreSQLga FK tartibida import qilinadi:
   `tenants`, `users`, `branches`, `roles`, `role_permissions`, `user_roles`, `user_branch_access`,
   `teachers`, `groups`, `students`, `rooms`, `schedules`, `lessons`, `attendance`,
   `finance_accounts`, `finance_categories`, `payments`, `invoices_transactions`,
   `subscriptions`, `leads`, `pipeline_stages`, `tasks`, `messages`, `audit_logs`, `platform_audit_logs`.
4. Row count va tenant bo'yicha checksum solishtiriladi.

## 4. Repository Abstraction

Hozir `AppRepository` `better-sqlite3` APIlariga bog'langan. PostgreSQLga o'tishdan oldin domain repositorylar quyidagicha ajratiladi:

- `studentsRepository`
- `groupsRepository`
- `lessonsRepository`
- `paymentsRepository`
- `leadsRepository`
- `platformRepository`
- `branchesRepository`
- `subscriptionsRepository`
- `financeRepository`
- `tasksRepository`
- `telegramQueueRepository`

Har bir repository `db.prepare().get/all/run` chaqiruvlarini bitta adapter orqali ishlatadi. Keyin SQLite adapter va PostgreSQL adapter alohida implementatsiya bo'ladi.

## 5. Cutover

1. Yangi PostgreSQL backend stagingda ishga tushiriladi.
2. `scripts/test-backend-logic.js` va `scripts/qa-smoke.js` PostgreSQL adapterga qarshi o'tkaziladi.
3. Production maintenance oynasida final export/import qilinadi.
4. `DATABASE_URL` PostgreSQLga yo'naltiriladi.
5. `/readyz` 200 qaytargandan keyin trafik ochiladi.

## 6. Rollback

- SQLite backup o'zgartirilmagan holda saqlanadi.
- Cutoverdan keyingi yozuvlar audit log orqali alohida export qilinadi.
- Critical xato bo'lsa `DATABASE_URL` eski SQLite konfiguratsiyasiga qaytariladi va service restart qilinadi.

## 7. Qabul Mezonlari

- Barcha tenantlarda row count mos.
- Student balance SQL ledgerdan qayta hisoblanganda mos.
- Soft-deleted payment/transactionlar active hisoblarga kirmaydi.
- Teacher role boshqa tenant yoki admin-only ma'lumotga kira olmaydi.
- SuperAdmin platform mode tenant data ko'rmaydi; faqat switch qilinganda active tenant context ishlaydi.
- Branch, role-permission, finance account/category, subscription va task row countlari tenant bo'yicha mos.
- Telegram queue worker PostgreSQLda duplicate processing qilmaydi.
