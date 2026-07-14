# DonoCRM P1: dars moliyasi va qaytariladigan settlement

Hujjat sanasi: 2026-07-13  
Scope: `attendance reason -> academic completion -> finance preview -> confirmation -> reversal -> controlled reopen`  
Amaldagi migration: `20260712_zzzzzzz_lesson_finance`

## Natija

P1 finance slice darsni akademik yakunlash bilan pul yozishni ikki alohida qarorga ajratadi:

1. Davomat saqlanadi, immutable revision yaratiladi va dars `completed / financialStatus=pending` bo'ladi.
2. Vakolatli admin preview'ni tekshiradi va alohida confirmation orqali student charge hamda teacher accrual'ni bitta tranzaksiyada yozadi.

Davomatni saqlashning o'zi hech qachon student ledger, teacher payroll yoki subscription usage yaratmaydi. Confirmation avtomatik emas.

## Holatlar modeli

Akademik holat:

```text
planned -> completed
completed -> planned       controlled reopen
planned -> cancelled       mavjud lesson lifecycle
```

Moliyaviy holat:

```text
unposted -> pending        yangi attendance revision
legacy   -> pending        eski darsga yangi/corrected attendance revision bilan opt-in
pending  -> posted         explicit financial confirmation
posted   -> reversed       compensating reversal
reversed -> pending        yangi attendance revision talab qilinadi
```

`Lesson.version` har qanday muhim lesson o'zgarishi uchun optimistic concurrency token. `attendanceVersion` davomat revisionini, `financialVersion` esa muvaffaqiyatli confirmation/reversal ketma-ketligini bildiradi.

## Domain obyektlari

### Attendance reason

`attendance_reasons` tenantga tegishli policy katalogidir. Har reason:

- bitta `attendanceStatus`ga (`present`, `absent`, `late`, `excused`) bog'langan;
- `chargePercent` va `consumePercent`ga ega;
- active/inactive va system/custom holatini saqlaydi;
- mavjud attendance/posting tarixini o'zgartirmasdan keyingi darslar uchun tahrirlanadi.

Har tenant uchun system reasonlar:

| Code | Attendance | Charge | Consume |
|---|---:|---:|---:|
| `present` | present | 100% | 100% |
| `late` | late | 100% | 100% |
| `absent_unexcused` | absent | 100% | 100% |
| `excused` | excused | 0% | 0% |

Client `reasonId` yubormasa, statusga mos active system reason tanlanadi. Tenant va status mosligi service validation hamda DB trigger bilan himoyalangan. Attendance row va revision reason ID/code/name hamda foizlarning snapshotini saqlaydi.

`consumePercent` hozir faqat snapshot qilinadi. Ushbu slice subscription lesson consumption yozmaydi: confirmation `subscription_id=NULL` va `consume_units=0` bilan ishlaydi.

### Student billing policy

`lesson_billing_policies` — effective-dated, versioned `per_lesson` base amount:

- tenant, optional branch va optional group konfiguratsiya scope'i;
- faqat `UZS`;
- bir xil exact scope'da active sanalar kesishishi bloklanadi;
- resolution lesson sanasida mos policylar orasidan group va branch specificity bo'yicha tanlaydi;
- teng specificity'dagi bir nechta nomzod confirmation'ni `billing_policy_ambiguous` bilan bloklaydi.

Student summasi:

```text
chargeAmount = round(baseAmount * attendanceReason.chargePercent / 100)
```

Har roster student uchun, jumladan `chargeAmount=0` bo'lsa ham, qaror snapshoti `lesson_student_postings`ga yoziladi. Ledger debit faqat summa musbat bo'lganda yaratiladi.

### Teacher rate rule

`teacher_rate_rules` effective-dated va versioned. Hozirgi resolver teacher, service date, optional group va optional lesson type bo'yicha ishlaydi:

- `flat`: `amount * 1`;
- `per_student`: `amount * present/late studentlar soni`;
- `hourly`: `amount * lessonDurationMinutes / 60`.

Natija UZSga yaxlitlanadi. Accrualda rate rule/version, rate amount, duration, basis quantity va attended count snapshot qilinadi. `branchId` configda saqlanishi mumkin, lekin bu branch-level authorization va'dasi emas.

### Finance period

`finance_periods` tenant-wide yoki optional branch financial-control scope'ida `open/closed` bo'ladi. Bu scope user RBAC emas.

- bir xil scope'dagi date range'lar kesishmaydi;
- periodni yopish ichida `completed + financialStatus=pending` dars bo'lsa bloklanadi;
- closed service period attendance save/correction, completed lesson reopen va confirmation'ni bloklaydi;
- reversal bugungi posting date bilan yoziladi va bugungi posting period ochiq bo'lishi kerak;
- reopen majburiy sabab bilan audit qilinadi.

### Settlement va append-only yozuvlar

- `lesson_financial_runs`: idempotency key, request fingerprint, operation va natija;
- `lesson_financial_settlements`: lesson, attendance revision, policy/rate versionlari va lifecycle;
- `lesson_student_postings`: har student bo'yicha immutable policy/reason/amount qarori;
- `invoices_transactions`: student debit yoki compensating credit;
- `teacher_accruals`: original accrual va append-only reversal entry;
- `lesson_events`: `finance_confirmed`, `finance_reversed`, `completion_reversed` old/new snapshotlari.

Original debit, posting va payroll accrual reversal paytida o'chirilmaydi yoki void qilinmaydi.

## Asosiy invariantlar

1. Barcha lookup va mutationlar `tenant_id` bilan scoped.
2. Attendance to'liq roster, unique student va har student uchun statusga mos active reason talab qiladi.
3. Completed attendance'ni teacher o'zgartirmaydi; admin correction sabab talab qiladi.
4. Active settlement bor paytda attendance correction bloklanadi: avval reversal.
5. Preview read-only va completed lesson uchungina ochiladi.
6. Confirmation faqat `completed + pending`, open service period, unique effective policy/rate va mos lesson/attendance versionlarda ishlaydi.
7. Confirmation/reversal `idempotencyKey`ni request fingerprint bilan bog'laydi. Bir xil retry reuse qilinadi, boshqa payload bilan bir xil key `409` oladi.
8. Money, settlement, posting, accrual, lesson state, balance sync va lesson event bitta `BEGIN IMMEDIATE` tranzaksiyada commit yoki rollback bo'ladi.
9. Reversal original moliyaviy yozuvlarni saqlab, ularga direct reference qiluvchi compensating yozuvlar qo'shadi.
10. Reversed settlementni qayta confirm qilishdan oldin yangi attendance revision shart.
11. Completed lesson reopen active settlementni qabul qilmaydi; live attendance rows o'chadi, immutable attendance revisions va finance history qoladi.
12. Branch qiymatlari configuration/financial-control scope sifatida ishlatiladi; ushbu slice branch-level RBACni implement qildi deb da'vo qilmaydi.

## Transaction ketma-ketligi

### 1. Attendance finalization

`POST /api/attendance`:

1. Lesson, assigned teacher, date, roster, reason/status va correction huquqi tekshiriladi.
2. Active settlement va closed service period tekshiriladi.
3. `BEGIN IMMEDIATE` ichida current attendance almashtiriladi.
4. Reason va uning charge/consume foiz snapshotlari bilan yangi attendance revision yaratiladi.
5. Lesson `completed`, `financialStatus=pending` qilinadi; `attendanceVersion` va `version` oshadi.
6. Lesson event yozilib commit qilinadi.

Bu bosqichda pul yoki payroll yozilmaydi.

### 2. Preview

`GET /api/lessons/:id/finance-preview`:

- effective billing policy va teacher rate'ni resolve qiladi;
- student charge lines va teacher accrualni hisoblaydi;
- `billing_policy_missing/ambiguous`, `teacher_rate_missing/ambiguous`, `legacy_lesson`, `attendance_missing`, `already_confirmed`, `new_revision_required`, `finance_period_closed` blockerlarini qaytaradi;
- `attendanceVersion` va `lessonVersion` confirmation tokenlarini beradi;
- DBga yozmaydi.

### 3. Confirmation

`POST /api/lessons/:id/confirm-finance`:

1. Service idempotency key, lesson state/version va closed periodni tekshiradi.
2. Repository `BEGIN IMMEDIATE` ochib, idempotency va versionlarni qayta tekshiradi.
3. Preview transaction ichida qayta hisoblanadi; blocker bo'lsa hammasi rollback.
4. Financial run va confirmed settlement yaratiladi.
5. Har student uchun posting snapshot yaratiladi; musbat summa uchun ledger debit qo'shiladi.
6. Bitta teacher accrual snapshot yaratiladi.
7. Lesson `financialStatus=posted` qilinib `financialVersion` va `version` oshiriladi.
8. Affected student balanslari sync, lesson event va run result yozilib commit qilinadi.

### 4. Reversal

`POST /api/lessons/:id/reverse-finance`:

1. Active settlement/version, sabab, idempotency va bugungi posting period tekshiriladi.
2. Har musbat original student debit uchun `reversal_of_id` bilan compensating credit yaratiladi.
3. Posting `reversed` qilinadi; original row saqlanadi.
4. Har original teacher accrual uchun `original_entry_id` bilan append-only reversal accrual qo'shiladi.
5. Settlement va lesson `reversed` qilinadi, balance/event/run natijasi yoziladi.
6. Barcha qadamlar bitta `BEGIN IMMEDIATE` ichida commit yoki rollback bo'ladi.

### 5. Completion reopen

`POST /api/lessons/:id/reopen` active settlement bo'lmaganda va service period ochiq bo'lganda darsni `planned`ga qaytaradi. Current attendance rows o'chiriladi, lekin eski revision settlementga FK bilan bog'langan holda qoladi. Reversed lesson `financialStatus=reversed`ni saqlaydi; boshqa no-settlement holatlar `unposted`ga qaytadi.

## Permission modeli

| Operatsiya | Runtime talab |
|---|---|
| Attendance reasons GET | Authenticated; teacher faqat active reasonlarni ko'radi |
| Attendance reason POST/PATCH | `admin` role |
| Billing policies GET | `admin` + `lesson_finance.read` |
| Billing policy POST | `admin` + `lesson_finance.confirm` |
| Teacher rate GET/POST/archive | `admin` + `payroll.manage` |
| Finance period GET/POST/close/reopen | `admin` + `finance_periods.manage` |
| Finance preview | `admin` + `lesson_finance.read` |
| Finance confirm | `admin` + `lesson_finance.confirm` |
| Finance reverse | `admin` + `lesson_finance.reverse` |
| Completed lesson reopen | `admin` role; alohida named permission hozir route'da yo'q |
| First attendance finalization | Assigned teacher yoki admin |
| Completed attendance correction | Faqat admin, `correctionReason` bilan |

Migration named permissionlarni mavjud admin role'lariga seed qiladi. Bu hujjat branch-based user authorizationni da'vo qilmaydi.

## Platformalardan olingan rationale

[AlfaCRM Calendar](https://alfacrm.pro/knowledge/main-sections/calendar) darsning planned/conducted/cancelled lifecycle'ini, darsni o'tkazishda roster, absence, topic va homework kontekstini birga boshqaradi. DonoCRM shu akademik kontekstni saqladi, lekin conducted/reversal paytida finance tarixini destructive o'chirish o'rniga alohida confirmation va compensating reversal qo'lladi.

[OpenEduCat Attendance](https://newdocs.openeducat.org/attendance/track-attendance/) attendance'ni draft/start/done kabi explicit finalization bilan boshqaradi. [Manage Sessions](https://newdocs.openeducat.org/timetable/manage-sessions/) completed sessionni oddiy editdan himoya qiladi. DonoCRM bundan academic finalize gate'ini oldi va ustiga alohida finance approval gate'i, optimistic version va idempotency qo'shdi.

[OpenEduCat Class Scheduling](https://newdocs.openeducat.org/timetable/class-scheduling/) faculty/session kontekstini konkret sessionga bog'laydi. Shuning uchun teacher rate settlement paytida lesson teacher va effective rate rule/version snapshoti bilan muzlatiladi.

Ko'r-ko'rona olinmagan patternlar:

- attendance save bilan avtomatik pul yozish;
- belgilanmagan studentni default present qilish;
- correction yoki reversal uchun eski rowlarni o'chirish;
- legacy completed darslarga taxminiy charge/payroll backfill qilish.

## Live-safe migration

Migration additive va idempotent:

- yangi table, column, index, trigger va named permissionlar qo'shadi;
- har mavjud va keyingi tenant uchun to'rtta system attendance reason yaratadi;
- mavjud completed darslarni `financialStatus=legacy` deb belgilaydi;
- mavjud ledger rowlarida faqat oldingi sign semantikasiga mos `effect` metadata (`debit/credit`) to'ldiradi.

Muhim xavfsizlik chegarasi: migration eski completed darslar uchun settlement, student posting, ledger charge, teacher accrual yoki subscription consumption yaratmaydi. Eski attendance rowlariga taxminiy reason/percentage ham backfill qilinmaydi. Legacy dars faqat operator yangi yoki corrected attendance revision saqlagandan keyin `pending` orqali finance oqimiga kiradi.

Upgrade tekshiruvi uchun:

```bash
SQLITE_FILE=/tmp/dono-upgrade-copy.sqlite node -e "require('./src/db/client').getDb()"
```

So'ng `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, legacy settlement/posting/accrual countlari va moliyaviy total o'zgarmagani tekshiriladi. Production DBda sinashdan oldin file copy/backup ishlatilishi kerak.

## Acceptance evidence

`scripts/test-backend-logic.js` ichidagi `P1 Lesson Finance: preview, atomic confirmation, idempotency, reversal and closed periods are enforced` testi quyidagilarni isbotlaydi:

- attendance finalization `pending` qiladi, ammo ledger count o'zgarmaydi;
- config yo'q preview `billing_policy_missing` va `teacher_rate_missing` qaytaradi;
- blocker bilan confirmation settlement yoki money row qoldirmaydi;
- 100,000 UZS policy va 50,000 UZS flat rate to'g'ri hisoblanadi;
- charged va excused student uchun ikkita posting snapshot saqlanadi, ammo faqat 100,000 UZS debit yoziladi;
- bir xil confirm retry `reused=true`; shu key bilan o'zgargan payload `409`;
- active settlement attendance correctionni bloklaydi;
- reversal original debitni saqlab 100,000 UZS credit qo'shadi va student balansini nolga qaytaradi;
- teacher accrual uchun append-only reversal row yaratiladi;
- bir xil reversal retry duplicate ledger/accrual yaratmaydi;
- controlled reopen live attendance rowsni olib tashlaydi, lekin attendance revision va reversed settlementni saqlaydi;
- closed period manual ledger mutationni bloklaydi; sabab bilan reopen yana ruxsat beradi.

Verification buyruqlari:

```bash
node scripts/test-backend-logic.js
python3 -c "import yaml; document=yaml.safe_load(open('docs/openapi.yaml')); assert document['openapi']=='3.0.3'"
```

2026-07-13 local verification natijasi:

- backend logic: `20/20 passed`;
- OpenAPI YAML: parse muvaffaqiyatli (`68` path, `22` component schema).

## Hozirgi chegaralar

- Subscription consumption hali implement qilinmagan; faqat `consumePercent` snapshot mavjud.
- Branch qiymatlari finance configuration/control scope; branch-level RBAC emas.
- Billing policy uchun hozir GET/POST bor; update/archive endpoint yo'q.
- Teacher rate rule create/archive qilinadi; in-place edit yo'q.
- Finance confirmation avtomatik emas va bulk confirmation yo'q.
- Ushbu hujjat payment/payroll payout yoki accounting export reconciliation'ni qamramaydi.

## Keyingi P1 schedule tartibi

Finance slice'dan keyingi ketma-ketlik qat'iy:

1. Recurring series lineage va `this occurrence / this and future` versioning.
2. Substitute teacher request/approval va original/substitute audit.
3. Holiday closure, bulk cancel va atomic undo.
4. Bulk reschedule — full preview va all-or-none conflict validation bilan.

Series lineage birinchi bo'lishi shart: substitute va holiday exceptionlari stable occurrence identity bo'lmasa successor rule ostida duplicate yoki yo'qolgan virtual dars yaratishi mumkin.
