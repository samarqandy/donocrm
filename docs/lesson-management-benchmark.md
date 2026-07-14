# DonoCRM darslar auditi va benchmark

Audit sanasi: 2026-07-12  
Scope: `ScheduleRule -> Lesson occurrence -> roster -> attendance -> notification` lifecycle, tenant/RBAC, calendar UX, tarix va migratsiya xavfsizligi.

## Executive xulosa

Audit boshida `ScheduleRule` va konkret dars bitta oqimga aralashgan edi. Qo'lda yaratilgan bir martalik dars `isRecurring=true` defaulti va startup backfill sabab haftalik ochiq jadvalga aylanishi mumkin edi. Regular jadvaldagi virtual darsni esa o'qituvchi o'zi ocholmas, admin har bir occurrence'ni materializatsiya qilishi kerak edi.

Live DB read-only snapshot:

- 12 ta konkret dars, 11 ta regular rule va 8 ta attendance row;
- 12/12 dars recurring rule'ga bog'langan;
- 11 ta active recurring rule'ning barchasi open-ended;
- 10 ta rule faqat bitta konkret dars bilan bog'langan — phantom future occurrence xavfi;
- keyingi haftada 11 ta virtual, 0 ta oldindan materializatsiya qilingan occurrence;
- 2 ta `waiting` darsda jami 4 attendance row, 2 ta `completed` darsda esa attendance yo'q;
- 6 ta o'tgan sana darsi hali `waiting`;
- duplicate schedule occurrence va cancelled+attendance topilmadi.

Eng kritik tuzatish: bir martalik dars endi hech qachon schedule rule yaratmaydi. Regular rule occurrence'i `(tenant_id, schedule_id, occurrence_date)` bilan bir marta materializatsiya qilinadi va cancellation/reschedule exception bo'lib o'z tarixini saqlaydi.

## Rasmiy platformalardan olingan patternlar

| Pattern | Rasmiy dalil | DonoCRM qarori |
|---|---|---|
| One-off va recurring alohida | AlfaCRM one-off va recurring darsni alohida boshqaradi; rule'da vaqt, xona, pedagog va amal davri bor. [AlfaCRM Calendar](https://alfacrm.pro/knowledge/main-sections/calendar) | Manual lesson `schedule_id=NULL`; regular occurrence explicit `scheduleId` bilan materializatsiya qilinadi |
| Rule konkret sessionlarni hosil qiladi | OpenEduCat recurring sozlama individual sessionlar yaratishini ko'rsatadi. [Class scheduling](https://newdocs.openeducat.org/timetable/class-scheduling/) | Unique `(schedule_id, occurrence_date)` va `occurrence_date` original slotni cancel/reschedule'dan keyin ham suppress qiladi |
| Conflict save'dan oldin bloklanadi | OpenEduCat faculty, room va batch collision'larini tekshiradi. [Class scheduling](https://newdocs.openeducat.org/timetable/class-scheduling/) | Group/teacher/room/student overlap, recurring rule va concrete lesson bir validator orqali hard-block; half-open interval |
| Session lifecycle va sabab | OpenEduCat edit/reschedule/cancel, availability check va reschedule/cancel reason ishlatadi. [Manage sessions](https://newdocs.openeducat.org/timetable/manage-sessions/) | `planned -> completed/cancelled`, cancel/restore/reschedule endpointlari, mandatory reason va append-only event |
| Completed session immutable | OpenEduCat completed sessionni oddiy edit qilmaydi; attendance `Draft -> Start -> Done` bilan yopiladi. [Manage sessions](https://newdocs.openeducat.org/timetable/manage-sessions/), [Attendance](https://newdocs.openeducat.org/attendance/track-attendance/) | Completed schedule immutable; teacher qayta yozolmaydi; admin correction reason va yangi attendance revision yaratadi |
| Topic/homework/session context | AlfaCRM darsni o'tkazishda roster, absence reason, topic, homework, file va student note kiritadi. [AlfaCRM Calendar](https://alfacrm.pro/knowledge/main-sections/calendar) | Hozir lesson'da `topic`, `homework`, `note`; richer per-student note/reason P1 |
| Cancel notification va substitute | OpenEduCat substitute availability va cancel reason/notification oqimini ko'rsatadi. [Class scheduling](https://newdocs.openeducat.org/timetable/class-scheduling/) | Schedule teacher konkret occurrence'ga snapshot qilinadi; substitute notification UI P1 |
| Historical roster saqlanishi | AlfaCRM'da membership o'chsa ham conducted lesson roster'i tarixda qoladi. [Groups](https://alfacrm.pro/knowledge/main-sections/group), [Customers](https://alfacrm.pro/knowledge/main-sections/customers) | Completed roster current membership bilan yo'qolmaydi; attendance revision to'liq snapshot saqlaydi |
| Notification idempotency | Platformalarda session-linked alert mavjud; retry duplicate yubormasligi DonoCRM invariantidir | `attendance:<lesson>:<revision>:<student>:<status>` dedupe key va guardian consent check |

OpenEduCat hujjatidagi barcha feature Community source'da aynan bir xil deb qabul qilinmadi. Audit public kodni commit bilan pin qildi: [timetable.py @ 7d5d28d](https://github.com/openeducat/openeducat_erp/blob/7d5d28deb6856792f99a9a5a3e3d3a48f35aa444/openeducat_timetable/models/timetable.py), [attendance_sheet.py @ 7d5d28d](https://github.com/openeducat/openeducat_erp/blob/7d5d28deb6856792f99a9a5a3e3d3a48f35aa444/openeducat_attendance/models/attendance_sheet.py). Public timetable constraint barcha sessionlarni skan qiladi; DonoCRM bu O(n) patternni ko'chirmadi va indexed SQL overlap ishlatadi.

## Joriy qilingan P0/P1

### Domain va migratsiya

- `lessons`: explicit `start_time/end_time`, `occurrence_date`, teacher/room snapshot, topic/homework/note, actor timestamps, cancel/complete metadata, optimistic `version`, `attendance_version`.
- `lesson_events`: created, updated, rescheduled, cancelled, restored, completed va attendance-corrected old/new snapshotlari.
- `lesson_attendance_revisions`: har finalize/correction uchun append-only full roster snapshot.
- `messages.dedupe_key`: bir attendance revision uchun qayta alert queue qilinmaydi.
- Startup'dagi `schedule_id IS NULL -> recurring schedule` backfill olib tashlandi; legacy conversion faqat versioned migrationda bir marta ishlaydi.

### Lifecycle va RBAC

- Admin one-off lesson yaratadi; `isRecurring=true` lesson API'da rad qilinadi va group schedule endpointiga yo'naltiriladi.
- Admin yoki assigned teacher regular virtual occurrence'ni materializatsiya qiladi.
- Assigned teacher faqat o'z occurrence roster/attendance/alert'iga kira oladi.
- Faqat admin reschedule/cancel/restore qiladi; completed lesson reschedule/cancel qilinmaydi.
- Reschedule optimistic version check va sabab talab qiladi.
- Cancel soft-state; restore conflictlarni qayta validatsiya qiladi.

### Conflict va roster

- Concrete lesson vs concrete lesson hamda concrete lesson vs active recurring rule tekshiriladi.
- Group, teacher, room va effective-dated student overlap hard-block.
- Teacher weekday working-hour sozlangan bo'lsa, lesson shu interval ichida bo'lishi shart.
- Cancelled occurrence slotni recurring virtual duplicate'dan suppress qiladi, lekin boshqa resurs conflictiga kirmaydi.
- Attendance har bir roster studentini aynan bir marta talab qiladi; duplicate, partial, empty, wrong-group, future va cancelled finalize bloklanadi.
- UI endi belgilanmagan studentni avtomatik `present` qilmaydi; barcha student explicit belgilanishi kerak.

### Attendance va xabar

- Birinchi save `completed` va revision 1 yaratadi.
- Completed attendance'ni teacher o'zgartira olmaydi.
- Admin correction faqat majburiy sabab bilan yangi revision yaratadi; eski revision o'chmaydi.
- Alert faqat completed attendance'dagi absent/late studentlar uchun.
- Guardian `receives_notifications=0` bo'lsa skip.
- Bir revision uchun qayta bosish duplicate Telegram message yaratmaydi.
- Matnda o'tgan dars uchun noto'g'ri `bugun` deyilmaydi; real lesson date ishlatiladi.

## Ko'r-ko'rona ko'chirilmagan joylar

- OpenEduCat qo'llanmasidagi generated roster default `Present` patterni olinmadi: bu tasodifiy to'liq davomat xavfini oshiradi.
- AlfaCRM'dagi conducted lessonni qaytarishda attendance'ni o'chirish modeli olinmadi: correction append-only revision/event yaratadi.
- AlfaCRM'dagi barcha kechagi darslarni avtomatik conducted va hammani present qilish opsiyasi olinmadi.
- Conflict warning-only yoki sababsiz override olinmadi; hozir hard-block.
- Recurring rule'ni har safar delete/recreate qilish olinmadi; konkret occurrence exception modeli ishlatiladi.
- OpenEduCat public source'dagi barcha sessionlarni skan qiluvchi constraint olinmadi.

## Qolgan backlog

P0/P1 keyingi iteratsiya:

1. Attendance reason catalog va tariff coefficient; finalized row'da policy/version/amount/currency snapshot.
2. Lesson finalize bilan student charge va teacher payroll accrual'ni bitta transactionda yozish; retry idempotency.
3. Completed lesson reversal: attendance/finance/payroll delete emas, compensating ledger entry.
4. Financial closed period va admin confirmation (`completed -> confirmed`).
5. `lesson_participants` alohida entity: trial/makeup/manual participant, membership ID va source snapshot.
6. Substitute teacher request/approval va original/substitute notification.
7. Recurring rule uchun `this occurrence / this and future` versioning.
8. Holiday va bulk cancel/reschedule: preview, batch ID, reason, atomic undo.
9. Makeup session link, attachment va per-student note/grade.
10. Parent portal attendance trend va delivery status.
11. `role_permissions`ni lesson/attendance route'larida role check bilan birga enforce qilish.
12. Legacy `schedule_id IS NULL` darslarni recurring deb talqin qilish bo'yicha operator review/report; noaniq rule'ni avtomatik o'chirmaslik.

## Acceptance criteria

- Manual lesson yaratilganda schedule count o'zgarmaydi.
- Bir schedule rule/date uchun ikkinchi occurrence yaratilmaydi.
- Cancelled/rescheduled occurrence original virtual slotni qayta chiqarmaydi.
- Teacher virtual occurrence'ni faqat o'z schedule'i uchun ochadi.
- Schedule substitute teacher konkret darsga to'g'ri snapshot qilinadi.
- Teacher/room/group/student overlap save'dan oldin 409 qaytaradi.
- Future yoki cancelled lesson completed bo'lmaydi.
- Partial/duplicate/unmarked roster finalized bo'lmaydi.
- Completed attendance correction eski revisionni saqlaydi va sabab/actor yozadi.
- Bir attendance revision alertini takrorlash message count'ni oshirmaydi.
- Tenant va teacher scoping boshqa markaz/dars ma'lumotini chiqarmaydi.

## Verification

- `node scripts/test-backend-logic.js` — 19/19 PASS.
- `node scripts/qa-smoke.js` — full PASS.
- Legacy upgrade copy — schema, migration, `PRAGMA integrity_check` va `foreign_key_check` bilan tekshiriladi.
