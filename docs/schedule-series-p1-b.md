# DonoCRM P1-B: schedule series va occurrence change contract

Audit/contract sanasi: 2026-07-13
Scope: administrator tomonidan bitta weekly occurrence yoki tanlangan occurrence'dan keyingi series qismini xavfsiz o'zgartirish.

## Natija

P1-B recurring jadvalni bitta mutable qator sifatida emas, immutable tarixga ega series versiyalari sifatida boshqaradi. Ikki admin endpoint rejalashtirilgan:

- `POST /api/group-schedules/{id}/changes/preview`
- `POST /api/group-schedules/{id}/changes`

Preview yozuv yaratmaydi. Apply canonical plan'ni qayta hisoblaydi, so'ng locked schedule versionni transaction ichida tekshirib o'zgarishni atomik qo'llaydi.

## Asosiy invariantlar

1. Har bir weekly slot alohida `series_id` oladi. Bitta guruhning dushanba va chorshanba qoidalari bitta series'ga birlashtirilmaydi.
2. Occurrence identity schedule qatori yoki o'zgaruvchan weekday'ga bog'lanmaydi:

   ```text
   occurrence_key = selected occurrence sanasining ISO week-year kaliti
   misol: "2026-W29"
   UNIQUE (tenant_id, series_id, occurrence_key)
   ```

3. Weekday o'zgarganda target sana o'zgaradi, `occurrence_key` o'zgarmaydi.
4. Oldingi schedule version, concrete lesson, lesson event, attendance revision va cancellation o'chirilmaydi.
5. Completed, cancelled, o'tgan concrete lesson va explicit override qilingan maydonlar series update bilan qayta yozilmaydi.
6. Schedule change student ledger, lesson settlement, subscription usage yoki teacher payroll'ga yozuv kiritmaydi va mavjud yozuvni o'zgartirmaydi.
7. Preview va apply tenant-scoped; ikkala endpoint ham faqat `admin` uchun.

## Request contract

Ikkala endpoint uchun asosiy body:

```json
{
  "scope": "this_and_future",
  "occurrenceDate": "2026-07-15",
  "version": 3,
  "reason": "Guruh va ota-onalar bilan kelishilgan yangi vaqt",
  "patch": {
    "weekday": 5,
    "startTime": "16:00",
    "endTime": "17:30",
    "teacherId": "teacher_123",
    "roomId": "room_2"
  },
  "idempotencyKey": "schedule-change:series_123:2026-07-15:v3"
}
```

| Field | Talab | Semantika |
|---|---|---|
| `scope` | majburiy | `this_occurrence` yoki `this_and_future` |
| `occurrenceDate` | majburiy | O'zgartirilayotgan original logical occurrence sanasi; reschedule'dan keyingi target sana emas |
| `version` | majburiy | Client ko'rgan joriy schedule version; stale qiymat `409` |
| `reason` | majburiy | Audit uchun bo'sh bo'lmagan, maksimal 500 belgili sabab |
| `patch` | majburiy | Kamida bitta scheduling maydoni |
| `idempotencyKey` | apply'da majburiy | Maksimal 120 belgi; preview'da kerak emas |

`patch` maydonlari:

- `weekday`: `1..7`; `this_occurrence`da shu ISO week ichidagi target kunni, `this_and_future`da yangi rule kunini tanlaydi;
- `startTime`, `endTime`: `HH:MM`, `endTime > startTime`;
- `teacherId`: tenant ichidagi active teacher;
- `roomId`: tenant ichidagi xona; `""` explicit xonani tozalaydi;
- `lessonLink`: faqat `this_and_future` uchun yangi online lesson link;
- `validUntil`: faqat `this_and_future` uchun optional series tugash sanasi;
- `status`: faqat `this_and_future` uchun `active` yoki series'ni to'xtatuvchi `inactive`.

Client hisoblangan `seriesId`, `occurrenceKey`, override mask, version split sanasi yoki affected lesson IDlarni yubormaydi. Ularni server chiqaradi.

## Scope semantikasi

### `this_occurrence`

- Schedule series/version o'zgarmaydi.
- Original logical week uchun virtual occurrence'dan concrete exception yaratiladi.
- Occurrence oldindan materialized qilingan bo'lsa endpoint `409` va lesson ID qaytaradi; operator uni mavjud lesson edit/cancel workflow'i orqali boshqaradi.
- Sana boshqa kunga ko'chsa ham original `(series_id, occurrence_key)` saqlanadi.
- O'zgargan scheduling maydonlari concrete lesson `override_mask`iga qo'shiladi.
- Completed yoki cancelled lesson oddiy schedule change bilan ochilmaydi; tegishli lesson lifecycle ishlatiladi.
- Cancellation bu endpoint vazifasi emas. Occurrence materializatsiya qilingandan keyin mavjud lesson cancel endpointi reason bilan ishlatiladi.

### `this_and_future`

- Eski schedule qatori in-place update qilinmaydi.
- Tanlangan logical week'dan oldingi version yopiladi, shu `series_id` bilan yangi version yaratiladi.
- Yangi weekday target sanani o'zgartiradi, logical-week occurrence key esa o'sha holatda qoladi.
- Faqat tanlangan week va undan keyingi `planned/waiting` concrete lessons successor defaultlariga ko'chiriladi.
- Server override mask bo'yicha explicit `date/time/teacher/room` qiymatlarni saqlaydi.
- Completed, cancelled, past, financially posted yoki ambiguous legacy concrete rows o'zgarmaydi va preview'da `preserved` sifatida ko'rsatiladi.

## Preview

`POST /api/group-schedules/{id}/changes/preview` state o'zgartirmaydi. `reason` va `version` talab qilinishi preview bilan keyingi apply bir xil operator niyati va bir xil baseline'da ekanini ko'rsatadi.

Muvaffaqiyatli javob:

```json
{
  "scheduleId": 6,
  "seriesId": "series_tenant_main_6",
  "scope": "this_and_future",
  "occurrenceDate": "2026-07-15",
  "occurrenceKey": "2026-W29",
  "version": 3,
  "canApply": true,
  "impact": {
    "createsOccurrenceException": false,
    "closesSeriesVersion": true,
    "createsSeriesVersion": true,
    "nextSeriesVersion": 4,
    "firstOccurrenceDate": "2026-07-17",
    "materializedLessonsPreserved": 2
  },
  "warnings": ["Existing materialized lessons are preserved as historical snapshots"]
}
```

Resource collision topilsa preview `409` va structured `details` qaytaradi. Stale version yoki materialized selected occurrence ham `409` bo'ladi.

Preview quyidagilarni tekshiradi:

- group, teacher, room va student interval conflict;
- teacher working hours;
- series/version va selected occurrence mosligi;
- target sana group va schedule validity ichida ekanligi;
- concrete lesson statusi va override mask;
- idempotent apply uchun deterministik canonical request payload.

## Apply

`POST /api/group-schedules/{id}/changes` faqat oldingi preview'da `canApply=true` bo'lgan niyat uchun chaqiriladi. Apply client yuborgan preview natijasiga ishonmaydi; canonical plan joriy holatdan qayta hisoblanadi va repository transaction'i schedule versionni lock/check qiladi.

Apply tartibi:

1. Tenant, admin role, schedule/series va `version` qayta tekshiriladi.
2. Canonical request hash idempotency run bilan tekshiriladi.
3. Conflict va immutable lesson tekshiruvlari qayta bajariladi; transaction boshlangach schedule version yana tekshiriladi.
4. `this_occurrence` exception lesson yoki `this_and_future` schedule version split yoziladi.
5. Schedule/lesson history eventlari reason, actor, old/new snapshot bilan append qilinadi.
6. Transaction commit qilinadi.

Javob preview shaklini va apply metadata'ni saqlaydi:

```json
{
  "reused": false,
  "scope": "this_and_future",
  "occurrenceKey": "2026-W29",
  "predecessor": { "id": 6, "seriesVersion": 3, "status": "inactive" },
  "schedule": { "id": 21, "seriesVersion": 4, "status": "active" },
  "preview": {
    "scheduleId": 6,
    "seriesId": "series_tenant_main_6",
    "scope": "this_and_future",
    "occurrenceDate": "2026-07-15",
    "occurrenceKey": "2026-W29",
    "version": 3,
    "canApply": true,
    "impact": {
      "closesSeriesVersion": true,
      "createsSeriesVersion": true,
      "nextSeriesVersion": 4,
      "materializedLessonsPreserved": 2
    }
  }
}
```

Bir xil tenant, idempotency key va canonical payload takrorlansa avvalgi natija `reused=true` bilan qaytadi. Shu key boshqa payload bilan ishlatilsa hech qanday write qilinmaydi va `409` qaytadi.

## HTTP xatolari

| Status | Holat |
|---|---|
| `403` | User admin emas yoki tenant context yo'q |
| `404` | Schedule/series tenant ichida topilmadi |
| `409` | Stale version, idempotency payload mismatch, resource conflict apply vaqtida, occurrence allaqachon boshqa change bilan o'zgargan, yoki selected concrete lesson immutable |
| `422` | Noto'g'ri scope/date/time, o'tgan `this_and_future` sanasi, bo'sh reason, no-op patch, invalid teacher/room yoki invalid idempotency key |

Har bir `409`dan keyin client schedule/profile'ni yangilab, preview'ni qayta olishi kerak. Apply conflictni override qiluvchi `force=true` parametri P1-B'da yo'q.

## Immutable tarix va finance chegarasi

- Old schedule version hard-delete qilinmaydi.
- Existing concrete lesson ID va original occurrence key o'zgarmaydi.
- Completed/cancelled lesson oddiy series update bilan `planned`ga qaytmaydi.
- Attendance va attendance revisionlar qayta yozilmaydi.
- `lesson_financial_settlements`, `invoices_transactions`, subscription usage va teacher payroll entrylari P1-B transactioniga kirmaydi.
- Financially posted concrete lesson scheduling propagation'dan chiqariladi. Uni o'zgartirish uchun avval mavjud controlled finance reversal va lesson reopen workflow'i ishlatiladi.
- Preview/apply transaction'i finance jadvallariga tegmasligi invariantdir; regressiya testlari ledger/settlement/payroll ta'siri nol ekanini tekshiradi.

## Live backfill qarori

2026-07-13 read-only auditda:

- 11 ta active open-ended weekly rule;
- 12 ta concrete linked lesson;
- duplicate schedule occurrence va proposed series/week key collision: `0`;
- 12/12 concrete lesson current schedule snapshotiga mos, shuning uchun initial scheduling `override_mask=0`;
- lesson eventlar: `0`, shu sabab legacy ambiguous farqlar bo'lsa conservative override talab qilinadi;
- 2026-07-12 uchun materializatsiya qilinmagan 3 ta past virtual occurrence mavjud.

Migration har bir current schedule'ga alohida series beradi va faqat mavjud 12 concrete lesson uchun occurrence key backfill qiladi. Uchta past virtual occurrence avtomatik materializatsiya qilinmaydi: projection dars haqiqatan o'tgani yoki bekor qilinganiga dalil emas.

## Deferred

Quyidagilar P1-B endpointlariga qo'shilmaydi:

- substitute teacher request/approval va notification;
- holiday calendar;
- bir nechta group/series uchun bulk preview/apply;
- bulk cancel/reschedule va atomic undo;
- makeup lesson orchestration;
- conflictni `force` bilan chetlab o'tish.

Ular keyingi alohida contractlarda shu series/occurrence identity va immutable history invariantlariga tayanadi.

## Acceptance mezonlari

- Preview database row count yoki versionni o'zgartirmaydi.
- Apply stale `version` bilan hech qanday partial write qilmaydi.
- Bir xil idempotent retry yangi schedule version, lesson yoki event yaratmaydi.
- Weekday change bir logical week uchun ikkinchi occurrence chiqarmaydi.
- `this_occurrence` boshqa haftalarga ta'sir qilmaydi.
- `this_and_future` old schedule/history'ni saqlaydi.
- Completed/cancelled/past va explicit override maydonlari o'zgarmaydi.
- Resource conflict transaction commitidan oldin bloklanadi.
- Finance impact har doim nol.
