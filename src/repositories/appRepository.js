const { id } = require("../utils/id");
const { dateForWeekday, isoWeekKey, isoWeekday, parseLessonTime } = require("../utils/schedule");
const { now, today } = require("../utils/time");
const { secret } = require("../config/app");
const { TelegramQueueRepository } = require("./domains/telegramQueueRepository");
const { hashPassword, verifyPassword } = require("../utils/password");
const { encryptSecret } = require("../utils/secrets");
const { normalizePhone } = require("../utils/phone");

function camelStudent(row) {
  const attendanceTotal = Number(row.attendance_total || 0);
  const attendancePresent = Number(row.attendance_present || 0);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    groupId: row.group_id,
    parentName: row.parent_name,
    phone: row.phone,
    parentRelationship: row.parent_relationship || "guardian",
    parentEmail: row.parent_email || "",
    studentPhone: row.student_phone || "",
    email: row.email || "",
    birthDate: row.birth_date || "",
    gender: row.gender || "",
    address: row.address || "",
    source: row.source || "",
    enrollmentDate: row.enrollment_date || "",
    note: row.note || "",
    archivedAt: row.archived_at || "",
    archiveReason: row.archive_reason || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    telegramChatId: row.effective_telegram_chat_id || row.telegram_chat_id || "",
    debt: row.debt,
    balance: Number(row.ledger_balance ?? row.balance ?? 0),
    status: row.status || "active",
    groupName: row.group_name,
    attendanceTotal,
    attendancePresent,
    attendanceRate: attendanceTotal ? Math.round((attendancePresent / attendanceTotal) * 100) : 0,
    attendanceStatus: row.attendance_status || "",
    attendanceReasonId: row.attendance_reason_id || row.reason_id || "",
    attendanceReasonCode: row.attendance_reason_code || row.reason_code || "",
    attendanceReasonName: row.attendance_reason_name || row.reason_name || "",
    attendanceNote: row.attendance_note || "",
  };
}

function camelGuardian(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    phone: row.phone || "",
    email: row.email || "",
    telegramChatId: row.telegram_chat_id || "",
    preferredLanguage: row.preferred_language || "uz",
    status: row.status || "active",
    relationship: row.relationship || "guardian",
    isPrimary: Boolean(row.is_primary),
    isEmergency: Boolean(row.is_emergency),
    receivesNotifications: Boolean(row.receives_notifications),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function camelEnrollment(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    studentId: row.student_id,
    groupId: row.group_id,
    groupName: row.group_name || "",
    subject: row.subject || "",
    teacherId: row.teacher_id || "",
    teacherName: row.teacher_name || "",
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date || "",
    reason: row.reason || "",
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
    endedBy: row.ended_by || "",
    endedAt: row.ended_at || "",
  };
}

function camelGroup(row) {
  const studentsCount = Number(row.students_count || 0);
  const capacity = Number(row.capacity || 0);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || "",
    name: row.name,
    subject: row.subject,
    description: row.description || "",
    level: row.level || "",
    teacherId: row.teacher_id,
    teacherName: row.teacher_name || "",
    room: row.room || "",
    monthlyFee: Number(row.monthly_fee || 0),
    capacity,
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    status: row.status || (row.active ? "active" : "archived"),
    color: row.color || "",
    note: row.note || "",
    archivedAt: row.archived_at || "",
    archiveReason: row.archive_reason || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    active: Boolean(row.active),
    studentsCount,
    occupancyPercent: capacity > 0 ? Math.min(100, Math.round((studentsCount / capacity) * 100)) : 0,
    schedulesCount: Number(row.schedules_count || 0),
    scheduleSummary: row.schedule_summary || "",
    totalLessons: Number(row.total_lessons || 0),
    plannedLessons: Number(row.planned_lessons || 0),
    completedLessons: Number(row.completed_lessons || 0),
    cancelledLessons: Number(row.cancelled_lessons || 0),
    attendanceRate: Number(row.attendance_rate || 0),
    nextLessonDate: row.next_lesson_date || "",
  };
}

function camelGroupSchedule(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || "",
    groupId: row.group_id,
    groupName: row.group_name || "",
    teacherId: row.teacher_id || "",
    teacherName: row.teacher_name || "",
    roomId: row.room_id || "",
    roomName: row.room_name || "",
    weekday: Number(row.weekday),
    startTime: row.start_time,
    endTime: row.end_time,
    isRecurring: Boolean(row.is_recurring),
    lessonType: row.lesson_type || "group",
    lessonLink: row.lesson_link || "",
    seriesId: row.series_id || "",
    supersedesScheduleId: row.supersedes_schedule_id || null,
    seriesVersion: Number(row.version || 1),
    changeReason: row.change_reason || "",
    createdBy: row.created_by || "",
    updatedBy: row.updated_by || "",
    validFrom: row.valid_from || "",
    validUntil: row.valid_until || "",
    status: row.schedule_status || row.status || "active",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function camelGroupTeacherAssignment(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    groupId: row.group_id,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name || "",
    status: row.status,
    startDate: row.valid_from,
    endDate: row.valid_until || "",
    createdBy: row.created_by || "",
    endedBy: row.ended_by || "",
    createdAt: row.created_at || "",
    endedAt: row.ended_at || "",
  };
}

function groupMetricsSelect() {
  const currentDate = today();
  return `SELECT g.*, teacher.name AS teacher_name,
    (SELECT COUNT(DISTINCT enrollment.student_id)
     FROM student_group_enrollments enrollment
     JOIN students student ON student.id = enrollment.student_id AND student.tenant_id = enrollment.tenant_id
     WHERE enrollment.tenant_id = g.tenant_id AND enrollment.group_id = g.id
       AND enrollment.status = 'active'
       AND enrollment.start_date <= '${currentDate}'
       AND (enrollment.end_date IS NULL OR enrollment.end_date = '' OR enrollment.end_date >= '${currentDate}')
       AND student.status != 'left') AS students_count,
    (SELECT COUNT(*)
     FROM schedules schedule
     WHERE schedule.tenant_id = g.tenant_id AND schedule.group_id = g.id
       AND schedule.is_recurring = 1 AND schedule.status = 'active'
       AND COALESCE(NULLIF(schedule.valid_from, ''), '${currentDate}') <= '${currentDate}'
       AND (schedule.valid_until IS NULL OR schedule.valid_until = '' OR schedule.valid_until >= '${currentDate}')) AS schedules_count,
    COALESCE((
      SELECT GROUP_CONCAT(summary.label, ' • ')
      FROM (
        SELECT schedule.weekday || ' ' || schedule.start_time || '–' || schedule.end_time AS label
        FROM schedules schedule
        WHERE schedule.tenant_id = g.tenant_id AND schedule.group_id = g.id
          AND schedule.is_recurring = 1 AND schedule.status = 'active'
          AND COALESCE(NULLIF(schedule.valid_from, ''), '${currentDate}') <= '${currentDate}'
          AND (schedule.valid_until IS NULL OR schedule.valid_until = '' OR schedule.valid_until >= '${currentDate}')
        ORDER BY CAST(schedule.weekday AS INTEGER), schedule.start_time
        LIMIT 3
      ) summary
    ), '') AS schedule_summary,
    (SELECT COUNT(*) FROM lessons lesson
     WHERE lesson.tenant_id = g.tenant_id AND lesson.group_id = g.id) AS total_lessons,
    (SELECT COUNT(*) FROM lessons lesson
     WHERE lesson.tenant_id = g.tenant_id AND lesson.group_id = g.id
       AND lesson.status IN ('waiting', 'planned')) AS planned_lessons,
    (SELECT COUNT(*) FROM lessons lesson
     WHERE lesson.tenant_id = g.tenant_id AND lesson.group_id = g.id
       AND lesson.status = 'completed') AS completed_lessons,
    (SELECT COUNT(*) FROM lessons lesson
     WHERE lesson.tenant_id = g.tenant_id AND lesson.group_id = g.id
       AND lesson.status = 'cancelled') AS cancelled_lessons,
    COALESCE((
      SELECT ROUND(100.0 * SUM(CASE WHEN attendance.status IN ('present', 'late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0))
      FROM attendance attendance
      JOIN lessons lesson ON lesson.id = attendance.lesson_id AND lesson.tenant_id = attendance.tenant_id
      WHERE attendance.tenant_id = g.tenant_id AND lesson.group_id = g.id
    ), 0) AS attendance_rate,
    COALESCE((SELECT MIN(lesson.date) FROM lessons lesson
      WHERE lesson.tenant_id = g.tenant_id AND lesson.group_id = g.id
        AND lesson.date >= '${currentDate}' AND lesson.status IN ('waiting', 'planned')), '') AS next_lesson_date
  FROM groups g
  LEFT JOIN teachers teacher ON teacher.id = g.teacher_id AND teacher.tenant_id = g.tenant_id`;
}

function camelLesson(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || "",
    groupId: row.group_id,
    scheduleId: row.schedule_id,
    date: row.date,
    time: row.time,
    startTime: row.start_time || parseLessonTime(row.time)?.startTime || "",
    endTime: row.end_time || parseLessonTime(row.time)?.endTime || "",
    occurrenceDate: row.occurrence_date || "",
    scheduleSeriesId: row.schedule_series_id || "",
    occurrenceKey: row.occurrence_key || "",
    overrideMask: Number(row.override_mask || 0),
    baseScheduleId: row.base_schedule_id || null,
    baseScheduleVersion: row.base_schedule_version === null || row.base_schedule_version === undefined
      ? null
      : Number(row.base_schedule_version),
    lessonType: row.lesson_type || "group",
    status: row.status,
    attendanceData: row.attendance_data,
    attendanceVersion: Number(row.attendance_version || 0),
    financialStatus: row.financial_status || "unposted",
    financialVersion: Number(row.financial_version || 0),
    version: Number(row.version || 1),
    groupName: row.group_name,
    subject: row.subject,
    roomId: row.effective_room_id || row.room_id || "",
    room: row.effective_room_name || row.room_name || row.room || "",
    teacherId: row.effective_teacher_id || row.teacher_id,
    teacherName: row.teacher_name,
    topic: row.topic || "",
    homework: row.homework || "",
    note: row.note || "",
    cancelledReason: row.cancelled_reason || "",
    rescheduleReason: row.reschedule_reason || "",
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
    updatedBy: row.updated_by || "",
    updatedAt: row.updated_at || "",
    completedBy: row.completed_by || "",
    completedAt: row.completed_at || "",
    cancelledBy: row.cancelled_by || "",
    cancelledAt: row.cancelled_at || "",
    financialReversedBy: row.financial_reversed_by || row.reversed_by || "",
    financialReversedAt: row.financial_reversed_at || row.reversed_at || "",
    financialReversalReason: row.financial_reversal_reason || row.reversal_reason || "",
  };
}

function camelScheduleLesson(row) {
  return {
    id: row.id,
    kind: row.row_kind || (String(row.id || "").startsWith("schedule_") ? "schedule" : "lesson"),
    group_id: row.group_id || "",
    group_name: row.group_name,
    subject: row.subject || "",
    teacher_id: row.teacher_id || "",
    teacher_name: row.teacher_name || "",
    room_id: row.room_id || "",
    room_name: row.room_name || "",
    weekday: Number(row.weekday),
    start_time: row.start_time,
    end_time: row.end_time,
    schedule_id: row.schedule_id,
    lesson_link: row.lesson_link || "",
    status: row.status || "planned",
    lesson_date: row.lesson_date || "",
    occurrence_date: row.occurrence_date || "",
    schedule_series_id: row.schedule_series_id || "",
    occurrence_key: row.occurrence_key || "",
  };
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function lessonStateSnapshot(lesson) {
  if (!lesson) return null;
  return {
    date: lesson.date,
    startTime: lesson.startTime,
    endTime: lesson.endTime,
    teacherId: lesson.teacherId || "",
    roomId: lesson.roomId || "",
    room: lesson.room || "",
    status: lesson.status,
    attendanceVersion: Number(lesson.attendanceVersion || 0),
    financialStatus: lesson.financialStatus || "unposted",
    financialVersion: Number(lesson.financialVersion || 0),
    topic: lesson.topic || "",
    homework: lesson.homework || "",
    note: lesson.note || "",
    version: Number(lesson.version || 1),
  };
}

function clockMinutes(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function lessonDurationMinutes(lesson) {
  const start = clockMinutes(lesson?.startTime);
  const end = clockMinutes(lesson?.endTime);
  return end > start ? end - start : 0;
}

function roundUzs(value) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function camelPayment(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || "",
    studentId: row.student_id,
    studentName: row.student_name,
    amount: row.amount,
    type: row.type,
    createdAt: row.created_at,
    status: row.status || "active",
    voidedAt: row.voided_at || "",
    voidedBy: row.voided_by || "",
    voidReason: row.void_reason || "",
    idempotencyKey: row.idempotency_key || "",
    accountId: row.account_id || "",
    categoryId: row.category_id || "",
  };
}

function transactionSign(type, effect = "") {
  if (effect === "credit") return 1;
  if (effect === "debit") return -1;
  return ["payment", "discount"].includes(type) ? 1 : -1;
}

function legacyPaymentType(method) {
  if (method === "cash" || method === "card" || method === "transfer") return method;
  return "transfer";
}

function camelTransaction(row) {
  const amount = Number(row.amount || 0);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || "",
    studentId: row.student_id,
    type: row.type,
    amount,
    effect: row.effect || (["payment", "discount"].includes(row.type) ? "credit" : "debit"),
    signedAmount: amount * transactionSign(row.type, row.effect),
    description: row.description || "",
    invoiceDate: row.invoice_date,
    createdAt: row.created_at,
    status: row.status || "active",
    voidedAt: row.voided_at || "",
    voidedBy: row.voided_by || "",
    voidReason: row.void_reason || "",
    idempotencyKey: row.idempotency_key || "",
    accountId: row.account_id || "",
    categoryId: row.category_id || "",
    currency: row.currency || "UZS",
    sourceType: row.source_type || "",
    sourceId: row.source_id || "",
    reversalOfId: row.reversal_of_id || null,
  };
}

function camelMessage(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    studentId: row.student_id || "",
    to: row.recipient,
    channel: row.channel,
    text: row.text,
    status: row.status,
    attempts: row.attempts,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    processingStartedAt: row.processing_started_at || "",
    nextAttemptAt: row.next_attempt_at || "",
    lastErrorCode: row.last_error_code || "",
    lastErrorMessage: row.last_error_message || "",
    telegramMessageId: row.telegram_message_id || "",
  };
}

function camelLead(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    phone: row.phone,
    source: row.source,
    status: row.status,
    stage: row.stage_id || row.stage || row.status || "new",
    stageId: row.stage_id || row.stage || row.status || "new",
    stageName: row.stage_name || "",
    stage_id: row.stage_id || row.stage || row.status || "new",
    stage_name: row.stage_name || "",
    responsibleAdmin: row.responsible_admin || "",
    nextAction: row.next_action || "",
    lostReason: row.lost_reason || "",
    convertedStudentId: row.converted_student_id || "",
    note: row.note,
    createdAt: row.created_at,
  };
}

function camelPipelineStage(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at || "",
    isSystem: Boolean(row.is_system),
  };
}

function statusForLeadStage(stage) {
  if (stage === "paid") return "converted";
  if (stage !== "new" && stage !== "lost") return "contacted";
  return "new";
}

function tenantDomain(value, fallback = "") {
  const source = String(value || fallback || "center").trim().toLowerCase();
  const normalized = source
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || `center-${Date.now().toString(36)}`;
}

function camelTenant(row) {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain || "",
    type: row.type || "",
    status: row.status || "",
    plan: row.plan || "",
    language: row.language || "",
    branchCount: Number(row.branch_count || 0),
    userCount: Number(row.user_count || 0),
    suspendedAt: row.suspended_at || "",
    suspendedReason: row.suspended_reason || "",
    createdAt: row.created_at,
  };
}

function publicPlatformUser(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id || null,
    username: row.username,
    name: row.name,
    role: row.role,
  };
}

function camelAudit(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    role: row.role,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    createdAt: row.created_at,
  };
}

function camelPlatformAudit(row) {
  let metadata = {};
  try {
    metadata = row.metadata ? JSON.parse(row.metadata) : {};
  } catch (_error) {
    metadata = {};
  }
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    tenantId: row.tenant_id || null,
    metadata,
    createdAt: row.created_at,
  };
}

function camelBranch(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    status: row.status,
    isMain: Boolean(row.is_main),
    createdAt: row.created_at,
  };
}

function camelRole(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    name: row.name,
    rank: Number(row.rank || 0),
    interface: row.interface,
    isSystem: Boolean(row.is_system),
    createdAt: row.created_at,
  };
}

function camelSubscription(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || "",
    studentId: row.student_id,
    studentName: row.student_name || "",
    groupId: row.group_id || "",
    groupName: row.group_name || "",
    name: row.name,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date || "",
    lessonsTotal: Number(row.lessons_total || 0),
    lessonsUsed: Number(row.lessons_used || 0),
    amount: Number(row.amount || 0),
    createdAt: row.created_at,
  };
}

function camelAttendanceReason(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    name: row.name,
    attendanceStatus: row.attendance_status,
    chargePercent: Number(row.charge_percent || 0),
    consumePercent: Number(row.consume_percent || 0),
    isActive: Boolean(row.is_active),
    isSystem: Boolean(row.is_system),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function camelLessonBillingPolicy(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || "",
    groupId: row.group_id || "",
    groupName: row.group_name || "",
    name: row.name || "",
    baseAmount: Number(row.base_amount || 0),
    currency: row.currency || "UZS",
    status: row.status || "active",
    validFrom: row.valid_from,
    validUntil: row.valid_until || "",
    version: Number(row.version || 1),
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
  };
}

function camelTeacherRateRule(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || "",
    teacherId: row.teacher_id,
    teacherName: row.teacher_name || "",
    groupId: row.group_id || "",
    groupName: row.group_name || "",
    lessonType: row.lesson_type || "",
    rateType: row.rate_type,
    amount: Number(row.rate_amount ?? row.amount ?? 0),
    currency: row.currency || "UZS",
    status: row.status || "active",
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until || "",
    version: Number(row.version || 1),
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
  };
}

function camelFinancePeriod(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || "",
    label: row.label || `${row.start_date} — ${row.end_date}`,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    version: Number(row.version || 1),
    closedAt: row.closed_at || "",
    closedBy: row.closed_by || "",
    closeReason: row.close_reason || row.closed_reason || "",
    reopenedAt: row.reopened_at || "",
    reopenedBy: row.reopened_by || "",
    reopenReason: row.reopen_reason || row.reopened_reason || "",
    createdAt: row.created_at || "",
  };
}

function camelFinancialRun(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    lessonId: row.lesson_id,
    operation: row.operation,
    idempotencyKey: row.idempotency_key,
    requestFingerprint: row.request_fingerprint || "",
    result: parseJson(row.result_json, {}),
    createdAt: row.created_at || "",
  };
}

function camelSettlement(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || "",
    lessonId: row.lesson_id,
    attendanceRevisionNo: Number(row.attendance_revision_no || 0),
    status: row.status,
    serviceDate: row.service_date,
    postingDate: row.posting_date,
    currency: row.currency || "UZS",
    billingPolicyId: row.billing_policy_id || "",
    billingPolicyVersion: Number(row.billing_policy_version || 0),
    teacherRateRuleId: row.teacher_rate_rule_id || "",
    teacherRateRuleVersion: Number(row.teacher_rate_rule_version || 0),
    confirmedBy: row.confirmed_by || "",
    confirmedAt: row.confirmed_at || "",
    reversedBy: row.reversed_by || "",
    reversedAt: row.reversed_at || "",
    reversalReason: row.reversal_reason || "",
    version: Number(row.version || 1),
    idempotencyKey: row.idempotency_key || "",
  };
}

function camelTeacherWorkingHour(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || "",
    teacherId: row.teacher_id,
    teacherName: row.teacher_name || "",
    weekday: row.weekday,
    startTime: row.start_time,
    endTime: row.end_time,
    createdAt: row.created_at,
  };
}

function camelTeacher(row) {
  const weeklyMinutes = Number(row.weekly_minutes || 0);
  const maxWeeklyMinutes = Number(row.max_weekly_minutes || 2400);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || "",
    name: row.name,
    phone: row.phone || "",
    email: row.email || "",
    specialization: row.specialization || "",
    employmentType: row.employment_type || "full_time",
    status: row.status || "active",
    hiredAt: row.hired_at || "",
    maxWeeklyMinutes,
    weeklyMinutes,
    workloadPercent: maxWeeklyMinutes > 0 ? Math.round((weeklyMinutes / maxWeeklyMinutes) * 100) : 0,
    note: row.note || "",
    createdAt: row.created_at || "",
    groupsCount: Number(row.groups_count || 0),
    studentsCount: Number(row.students_count || 0),
    completedLessons: Number(row.completed_lessons || 0),
    hasAccess: Boolean(row.user_id),
    username: row.username || "",
    accessStatus: row.user_id ? row.access_status || "active" : "not_granted",
  };
}

function camelFinanceAccount(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
  };
}

function camelFinanceCategory(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    kind: row.kind,
    isSystem: Boolean(row.is_system),
    createdAt: row.created_at,
  };
}

function camelTask(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at || "",
    assigneeUserId: row.assignee_user_id || "",
    assigneeName: row.assignee_name || "",
    authorUserId: row.author_user_id || "",
    authorName: row.author_name || "",
    relatedType: row.related_type || "",
    relatedId: row.related_id || "",
    note: row.note || "",
    createdAt: row.created_at,
    completedAt: row.completed_at || "",
    archivedAt: row.archived_at || "",
  };
}

function camelAttendance(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    lessonId: row.lesson_id,
    studentId: row.student_id,
    studentName: row.student_name,
    parentName: row.parent_name,
    groupId: row.group_id,
    groupName: row.group_name,
    subject: row.subject,
    teacherId: row.teacher_id,
    status: row.status,
    reasonId: row.reason_id || "",
    reasonCode: row.reason_code || "",
    reasonName: row.reason_name || "",
    chargePercent: Number(row.charge_percent || 0),
    consumePercent: Number(row.consume_percent || 0),
    note: row.note,
    createdAt: row.created_at,
    lessonTime: row.lesson_time,
    lessonDate: row.lesson_date,
  };
}

class AppRepository {
  constructor(db) {
    this.db = db;
    this.telegramQueue = new TelegramQueueRepository(db);
  }

  tenant(tenantId) {
    const row = this.db.prepare("SELECT id, name, domain, type, status, plan, language, telegram_bot, telegram_bot_token, telegram_bot_token_encrypted, suspended_at, suspended_reason, created_at FROM tenants WHERE id = ?").get(tenantId);
    if (!row) return null;
    const envTelegramToken = secret("DONO_TELEGRAM_BOT_TOKEN", tenantId);
    return {
      id: row.id,
      name: row.name,
      domain: row.domain || "",
      type: row.type,
      status: row.status,
      plan: row.plan,
      language: row.language,
      suspendedAt: row.suspended_at || "",
      suspendedReason: row.suspended_reason || "",
      telegramBot: row.telegram_bot,
      telegramBotTokenSet: Boolean(envTelegramToken || row.telegram_bot_token_encrypted || row.telegram_bot_token),
      telegramBotTokenSource: envTelegramToken ? "env" : row.telegram_bot_token_encrypted ? "encrypted_database" : row.telegram_bot_token ? "legacy_database" : "",
      createdAt: row.created_at,
    };
  }

  userByUsername(username) {
    return this.db
      .prepare(
        `SELECT u.id, u.tenant_id, u.username, u.password, u.name, u.role, u.status AS user_status, t.status AS tenant_status
         FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
         WHERE u.username = ?`,
      )
      .get(username);
  }

  userBySession(sessionId, nowIso) {
    return this.db
      .prepare(
	        `SELECT u.id, u.tenant_id, u.username, u.name, u.role, u.status AS user_status, s.id AS session_id, s.active_tenant_id,
	                COALESCE(active_tenant.status, home_tenant.status) AS tenant_status
	         FROM sessions s
	         JOIN users u ON u.id = s.user_id
	         LEFT JOIN tenants home_tenant ON home_tenant.id = u.tenant_id
	         LEFT JOIN tenants active_tenant ON active_tenant.id = s.active_tenant_id
	         WHERE s.id = ? AND s.expires_at > ? AND COALESCE(u.status, 'active') = 'active'`,
      )
      .get(sessionId, nowIso);
  }

  createSession(user, sessionId, createdAt, expiresAt) {
    this.db.prepare("INSERT INTO sessions (id, user_id, tenant_id, active_tenant_id, created_at, expires_at) VALUES (?, ?, ?, NULL, ?, ?)").run(
      sessionId,
      user.id,
      user.tenant_id || null,
      createdAt,
      expiresAt,
    );
  }

  deleteSession(sessionId) {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  setSessionActiveTenant(sessionId, tenantId) {
    this.db.prepare("UPDATE sessions SET active_tenant_id = ? WHERE id = ?").run(tenantId || null, sessionId);
  }

  platformTenants() {
    return this.db
      .prepare(
        `SELECT t.id, t.name, t.domain, t.type, t.status, t.plan, t.language, t.suspended_at, t.suspended_reason, t.created_at,
                (SELECT COUNT(*) FROM branches b WHERE b.tenant_id = t.id) AS branch_count,
                (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count
         FROM tenants t
         ORDER BY t.name`,
      )
      .all()
      .map(camelTenant);
  }

  createPlatformTenant(payload) {
    const name = String(payload.name || "").trim();
    if (!name) {
      const error = new Error("Tenant name is required");
      error.status = 422;
      throw error;
    }
    const domain = tenantDomain(payload.domain, name);
    const tenantId = `tenant_${domain.replace(/-/g, "_")}_${Date.now().toString(36)}`;
    const createdAt = now();
    try {
      this.db
        .prepare(
          `INSERT INTO tenants (id, name, domain, type, status, plan, language, telegram_bot, telegram_bot_token, created_at)
           VALUES (?, ?, ?, 'learning_center', ?, ?, 'uz', '', '', ?)`,
        )
        .run(tenantId, name, domain, payload.status || "active", payload.plan || "standard", createdAt);
      this.ensureTenantFoundation(tenantId, name, createdAt);
    } catch (error) {
      if (String(error.message || "").includes("UNIQUE")) {
        const conflict = new Error("Tenant domain already exists");
        conflict.status = 409;
        throw conflict;
      }
      throw error;
    }
    return this.platformTenant(tenantId);
  }

  platformTenant(tenantId) {
    const row = this.db
      .prepare(
        `SELECT t.id, t.name, t.domain, t.type, t.status, t.plan, t.language, t.suspended_at, t.suspended_reason, t.created_at,
                (SELECT COUNT(*) FROM branches b WHERE b.tenant_id = t.id) AS branch_count,
                (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count
         FROM tenants t
         WHERE t.id = ?`,
      )
      .get(tenantId);
    return row ? camelTenant(row) : null;
  }

  updatePlatformTenant(tenantId, payload) {
    const existing = this.platformTenant(tenantId);
    if (!existing) return null;
    const status = payload.status || existing.status;
    const plan = payload.plan || existing.plan;
    const suspendedAt = status === "suspended" || status === "blocked" ? now() : "";
    this.db
      .prepare(
        `UPDATE tenants
         SET name = ?, status = ?, plan = ?, suspended_at = ?, suspended_reason = ?
         WHERE id = ?`,
      )
      .run(payload.name || existing.name, status, plan, suspendedAt, payload.suspendedReason || "", tenantId);
    return this.platformTenant(tenantId);
  }

  ensureTenantFoundation(tenantId, tenantName, timestamp = now()) {
    const branchId = `branch_${tenantId.replace(/^tenant_/, "").replace(/[^a-zA-Z0-9_]/g, "_")}`;
    this.db
      .prepare("INSERT OR IGNORE INTO branches (id, tenant_id, name, status, is_main, created_at) VALUES (?, ?, ?, 'active', 1, ?)")
      .run(branchId, tenantId, tenantName || "Asosiy filial", timestamp);

    const roles = [
      {
        id: `${tenantId}_role_admin`,
        code: "admin",
        name: "Administrator",
        rank: 100,
        interface: "administration",
        permissions: [
          "students.read",
          "students.manage",
          "groups.read",
          "groups.manage",
          "lessons.read",
          "lessons.manage",
          "attendance.read",
          "attendance.manage",
          "payments.read",
          "payments.manage",
          "payments.export",
          "leads.read",
          "leads.manage",
          "tasks.read",
          "tasks.manage",
          "settings.manage",
          "branches.manage",
          "subscriptions.manage",
          "finance.manage",
          "lesson_finance.read",
          "lesson_finance.confirm",
          "lesson_finance.reverse",
          "payroll.manage",
          "finance_periods.manage",
        ],
      },
      {
        id: `${tenantId}_role_teacher`,
        code: "teacher",
        name: "O'qituvchi",
        rank: 10,
        interface: "teacher",
        permissions: ["students.read", "groups.read", "lessons.read", "attendance.read", "attendance.manage", "tasks.read"],
      },
    ];
    const roleStmt = this.db.prepare("INSERT OR IGNORE INTO roles (id, tenant_id, code, name, rank, interface, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)");
    const permissionStmt = this.db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission, created_at) VALUES (?, ?, ?)");
    roles.forEach((role) => {
      roleStmt.run(role.id, tenantId, role.code, role.name, role.rank, role.interface, timestamp);
      role.permissions.forEach((permission) => permissionStmt.run(role.id, permission, timestamp));
    });

    this.db
      .prepare("INSERT OR IGNORE INTO finance_accounts (id, tenant_id, name, type, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)")
      .run(`${tenantId}_cash`, tenantId, "Asosiy kassa", "cash", timestamp);
    this.db
      .prepare("INSERT OR IGNORE INTO finance_accounts (id, tenant_id, name, type, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)")
      .run(`${tenantId}_bank`, tenantId, "Bank hisob raqami", "bank", timestamp);
    const categoryStmt = this.db.prepare("INSERT OR IGNORE INTO finance_categories (id, tenant_id, name, kind, is_system, created_at) VALUES (?, ?, ?, ?, 1, ?)");
    [
      ["tuition", "O'qish to'lovi", "income"],
      ["discount", "Chegirma", "income"],
      ["refund", "Qaytarish", "expense"],
      ["salary", "Oylik", "expense"],
      ["correction", "Tuzatish", "adjustment"],
    ].forEach(([code, name, kind]) => categoryStmt.run(`${tenantId}_${code}`, tenantId, name, kind, timestamp));
  }

  createPlatformTenantAdmin(tenantId, payload) {
    if (!this.platformTenant(tenantId)) {
      const error = new Error("Tenant not found");
      error.status = 404;
      throw error;
    }
    const name = String(payload.name || "").trim();
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");
    if (!name || !username || password.length < 6) {
      const error = new Error("Admin name, username and password are required");
      error.status = 422;
      throw error;
    }
    const row = {
      id: id(),
      tenant_id: tenantId,
      username,
      password: hashPassword(password),
      name,
      role: "admin",
    };
    try {
      this.db
        .prepare("INSERT INTO users (id, tenant_id, username, password, name, role) VALUES (?, ?, ?, ?, ?, 'admin')")
        .run(row.id, row.tenant_id, row.username, row.password, row.name);
      this.db
        .prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id, tenant_id, created_at) VALUES (?, ?, ?, ?)")
        .run(row.id, `${tenantId}_role_admin`, tenantId, now());
      const mainBranch = this.db.prepare("SELECT id FROM branches WHERE tenant_id = ? AND is_main = 1 LIMIT 1").get(tenantId);
      if (mainBranch) {
        this.db
          .prepare("INSERT OR IGNORE INTO user_branch_access (tenant_id, user_id, branch_id, created_at) VALUES (?, ?, ?, ?)")
          .run(tenantId, row.id, mainBranch.id, now());
      }
    } catch (error) {
      if (String(error.message || "").includes("UNIQUE")) {
        const conflict = new Error("Username already exists");
        conflict.status = 409;
        throw conflict;
      }
      throw error;
    }
    return publicPlatformUser(row);
  }

  platformAudit(actorUserId, action, entity, entityId, tenantId = null, metadata = {}) {
    const row = {
      id: id(),
      actorUserId,
      action,
      entity,
      entityId,
      tenantId: tenantId || null,
      metadata,
      createdAt: now(),
    };
    this.db
      .prepare(
        `INSERT INTO platform_audit_logs (id, actor_user_id, action, entity, entity_id, tenant_id, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, row.actorUserId, row.action, row.entity, row.entityId, row.tenantId, JSON.stringify(row.metadata || {}), row.createdAt);
    return row;
  }

  platformAuditLogs(limit = 50) {
    return this.db
      .prepare("SELECT * FROM platform_audit_logs ORDER BY created_at DESC LIMIT ?")
      .all(Math.min(Math.max(Number(limit || 50), 1), 100))
      .map(camelPlatformAudit);
  }

  updateTelegramSettings(tenantId, payload) {
    const encrypted = encryptSecret(payload.telegramBotToken);
    this.db.prepare("UPDATE tenants SET telegram_bot = ?, telegram_bot_token_encrypted = ?, telegram_bot_token = NULL WHERE id = ?").run(payload.telegramBot, encrypted, tenantId);
    return this.tenant(tenantId);
  }

  updateTenantName(tenantId, name) {
    this.db.prepare("UPDATE tenants SET name = ? WHERE id = ?").run(name, tenantId);
    return this.tenant(tenantId);
  }

  changeUserPassword(userId, currentPassword, newPassword) {
    const user = this.db.prepare("SELECT id, password FROM users WHERE id = ? LIMIT 1").get(userId);
    if (!user || !verifyPassword(currentPassword, user.password)) {
      const error = new Error("Joriy parol noto'g'ri");
      error.status = 401;
      throw error;
    }
    if (String(newPassword || "").length < 6) {
      const error = new Error("Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak");
      error.status = 422;
      throw error;
    }
    this.db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword(newPassword), userId);
    return { success: true };
  }

  telegramToken(tenantId) {
    return this.telegramQueue.telegramToken(tenantId);
  }

  students(tenantId, includeArchived = false) {
    const archiveClause = includeArchived ? "" : "AND s.status != 'left'";
    return this.db
      .prepare(
        `SELECT s.*, g.name AS group_name, sg.relationship AS parent_relationship, guardian.email AS parent_email,
                COALESCE(NULLIF(s.telegram_chat_id, ''), guardian.telegram_chat_id, '') AS effective_telegram_chat_id,
                COALESCE((
                  SELECT SUM(CASE WHEN it.effect = 'credit' THEN it.amount WHEN it.effect = 'debit' THEN -it.amount WHEN it.type IN ('payment', 'discount') THEN it.amount ELSE -it.amount END)
                  FROM invoices_transactions it
                  WHERE it.student_id = s.id AND it.tenant_id = s.tenant_id
                    AND COALESCE(it.status, 'active') = 'active'
                ), s.balance, 0) AS ledger_balance,
                (SELECT COUNT(*) FROM attendance a WHERE a.tenant_id = s.tenant_id AND a.student_id = s.id) AS attendance_total,
                (SELECT COUNT(*) FROM attendance a WHERE a.tenant_id = s.tenant_id AND a.student_id = s.id AND a.status IN ('present', 'late')) AS attendance_present
	         FROM students s
	         JOIN groups g ON g.id = s.group_id AND g.tenant_id = ?
	         LEFT JOIN student_guardians sg ON sg.tenant_id = s.tenant_id AND sg.student_id = s.id AND sg.is_primary = 1
	         LEFT JOIN guardians guardian ON guardian.id = sg.guardian_id AND guardian.tenant_id = sg.tenant_id
	         WHERE s.tenant_id = ? ${archiveClause}
	         ORDER BY CASE s.status WHEN 'left' THEN 1 ELSE 0 END, s.name`,
	      )
	      .all(tenantId, tenantId)
	      .map(camelStudent);
  }

  studentsForTeacher(tenantId, teacherId) {
    return this.db
      .prepare(
        `SELECT s.*, g.name AS group_name, sg.relationship AS parent_relationship, guardian.email AS parent_email,
                COALESCE(NULLIF(s.telegram_chat_id, ''), guardian.telegram_chat_id, '') AS effective_telegram_chat_id,
                COALESCE((
                  SELECT SUM(CASE WHEN it.effect = 'credit' THEN it.amount WHEN it.effect = 'debit' THEN -it.amount WHEN it.type IN ('payment', 'discount') THEN it.amount ELSE -it.amount END)
                  FROM invoices_transactions it
                  WHERE it.student_id = s.id AND it.tenant_id = s.tenant_id
                    AND COALESCE(it.status, 'active') = 'active'
                ), s.balance, 0) AS ledger_balance
         FROM students s
         JOIN groups g ON g.id = s.group_id AND g.tenant_id = s.tenant_id
         LEFT JOIN student_guardians sg ON sg.tenant_id = s.tenant_id AND sg.student_id = s.id AND sg.is_primary = 1
         LEFT JOIN guardians guardian ON guardian.id = sg.guardian_id AND guardian.tenant_id = sg.tenant_id
         WHERE s.tenant_id = ? AND g.teacher_id = ? AND s.status != 'left'
         ORDER BY s.name`,
      )
      .all(tenantId, teacherId)
      .map(camelStudent);
  }

  searchStudents(tenantId, search = "", includeArchived = false) {
    const query = String(search || "").trim().toLowerCase();
    const like = `%${query}%`;
    const params = query ? [tenantId, like, like] : [tenantId];
    const archiveClause = includeArchived ? "" : "AND s.status != 'left'";
    const where = query ? `WHERE s.tenant_id = ? ${archiveClause} AND (LOWER(s.name) LIKE ? OR LOWER(s.phone) LIKE ?)` : `WHERE s.tenant_id = ? ${archiveClause}`;
    return this.db
      .prepare(
        `SELECT s.*, g.name AS group_name, sg.relationship AS parent_relationship, guardian.email AS parent_email,
                COALESCE(NULLIF(s.telegram_chat_id, ''), guardian.telegram_chat_id, '') AS effective_telegram_chat_id,
                COALESCE((
                  SELECT SUM(CASE WHEN it.effect = 'credit' THEN it.amount WHEN it.effect = 'debit' THEN -it.amount WHEN it.type IN ('payment', 'discount') THEN it.amount ELSE -it.amount END)
                  FROM invoices_transactions it
                  WHERE it.student_id = s.id AND it.tenant_id = s.tenant_id
                    AND COALESCE(it.status, 'active') = 'active'
                ), s.balance, 0) AS ledger_balance,
                (SELECT COUNT(*) FROM attendance a WHERE a.tenant_id = s.tenant_id AND a.student_id = s.id) AS attendance_total,
                (SELECT COUNT(*) FROM attendance a WHERE a.tenant_id = s.tenant_id AND a.student_id = s.id AND a.status IN ('present', 'late')) AS attendance_present
         FROM students s
         LEFT JOIN groups g ON g.id = s.group_id AND g.tenant_id = s.tenant_id
         LEFT JOIN student_guardians sg ON sg.tenant_id = s.tenant_id AND sg.student_id = s.id AND sg.is_primary = 1
         LEFT JOIN guardians guardian ON guardian.id = sg.guardian_id AND guardian.tenant_id = sg.tenant_id
         ${where}
         ORDER BY s.name
         LIMIT 20`,
      )
      .all(...params)
      .map(camelStudent);
  }

  searchStudentsForTeacher(tenantId, teacherId, search = "") {
    const query = String(search || "").trim().toLowerCase();
    const like = `%${query}%`;
    return this.db
      .prepare(
        `SELECT s.*, g.name AS group_name, sg.relationship AS parent_relationship, guardian.email AS parent_email,
                COALESCE(NULLIF(s.telegram_chat_id, ''), guardian.telegram_chat_id, '') AS effective_telegram_chat_id,
                COALESCE((
                  SELECT SUM(CASE WHEN it.effect = 'credit' THEN it.amount WHEN it.effect = 'debit' THEN -it.amount WHEN it.type IN ('payment', 'discount') THEN it.amount ELSE -it.amount END)
                  FROM invoices_transactions it
                  WHERE it.student_id = s.id AND it.tenant_id = s.tenant_id
                    AND COALESCE(it.status, 'active') = 'active'
                ), s.balance, 0) AS ledger_balance
         FROM students s
         JOIN groups g ON g.id = s.group_id AND g.tenant_id = s.tenant_id
         LEFT JOIN student_guardians sg ON sg.tenant_id = s.tenant_id AND sg.student_id = s.id AND sg.is_primary = 1
         LEFT JOIN guardians guardian ON guardian.id = sg.guardian_id AND guardian.tenant_id = sg.tenant_id
         WHERE s.tenant_id = ? AND g.teacher_id = ? AND s.status != 'left' AND (LOWER(s.name) LIKE ? OR LOWER(s.phone) LIKE ?)
         ORDER BY s.name
         LIMIT 20`,
      )
      .all(tenantId, teacherId, like, like)
      .map(camelStudent);
  }

  groups(tenantId, includeArchived = false) {
    const archiveClause = includeArchived ? "" : "AND g.status != 'archived'";
    return this.db
      .prepare(`${groupMetricsSelect()} WHERE g.tenant_id = ? ${archiveClause}
                ORDER BY CASE g.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'completed' THEN 2 WHEN 'cancelled' THEN 3 ELSE 4 END, g.name`)
      .all(tenantId)
      .map(camelGroup);
  }

  group(tenantId, groupId) {
    const row = this.db
      .prepare(`${groupMetricsSelect()} WHERE g.tenant_id = ? AND g.id = ? LIMIT 1`)
      .get(tenantId, groupId);
    return row ? camelGroup(row) : null;
  }

  groupsForTeacher(tenantId, teacherId) {
    return this.db
      .prepare(`${groupMetricsSelect()}
                WHERE g.tenant_id = ? AND g.teacher_id = ? AND g.status != 'archived'
                ORDER BY CASE g.status WHEN 'active' THEN 0 ELSE 1 END, g.name`)
      .all(tenantId, teacherId)
      .map(camelGroup);
  }

  room(tenantId, roomId) {
    if (!roomId) return null;
    const row = this.db.prepare("SELECT * FROM rooms WHERE tenant_id = ? AND id = ? LIMIT 1").get(tenantId, roomId);
    return row
      ? { id: row.id, tenantId: row.tenant_id, name: row.name, createdAt: row.created_at || "" }
      : null;
  }

  rooms(tenantId) {
    return this.db
      .prepare("SELECT * FROM rooms WHERE tenant_id = ? ORDER BY name, id")
      .all(tenantId)
      .map((row) => ({ id: row.id, tenantId: row.tenant_id, name: row.name, createdAt: row.created_at || "" }));
  }

  groupSchedule(tenantId, scheduleId) {
    const row = this.db
      .prepare(
        `SELECT schedule.*, schedule.status AS schedule_status,
                group_row.name AS group_name,
                teacher.name AS teacher_name,
                room.name AS room_name
         FROM schedules schedule
         JOIN groups group_row
           ON group_row.id = schedule.group_id AND group_row.tenant_id = schedule.tenant_id
         LEFT JOIN teachers teacher
           ON teacher.id = schedule.teacher_id AND teacher.tenant_id = schedule.tenant_id
         LEFT JOIN rooms room
           ON room.id = schedule.room_id AND room.tenant_id = schedule.tenant_id
         WHERE schedule.tenant_id = ? AND schedule.id = ?
         LIMIT 1`,
      )
      .get(tenantId, scheduleId);
    return row ? camelGroupSchedule(row) : null;
  }

  groupSchedules(tenantId, groupId, includeInactive = true) {
    const statusClause = includeInactive ? "" : "AND schedule.status = 'active'";
    return this.db
      .prepare(
        `SELECT schedule.*, schedule.status AS schedule_status,
                group_row.name AS group_name,
                teacher.name AS teacher_name,
                room.name AS room_name
         FROM schedules schedule
         JOIN groups group_row
           ON group_row.id = schedule.group_id AND group_row.tenant_id = schedule.tenant_id
         LEFT JOIN teachers teacher
           ON teacher.id = schedule.teacher_id AND teacher.tenant_id = schedule.tenant_id
         LEFT JOIN rooms room
           ON room.id = schedule.room_id AND room.tenant_id = schedule.tenant_id
         WHERE schedule.tenant_id = ? AND schedule.group_id = ? ${statusClause}
         ORDER BY CASE schedule.status WHEN 'active' THEN 0 ELSE 1 END,
                  CAST(schedule.weekday AS INTEGER), schedule.start_time, schedule.id`,
      )
      .all(tenantId, groupId)
      .map(camelGroupSchedule);
  }

  scheduleConflict(tenantId, payload, excludeScheduleId = null) {
    const excluded = excludeScheduleId === null || excludeScheduleId === undefined || excludeScheduleId === ""
      ? null
      : excludeScheduleId;
    return this.db
      .prepare(
        `SELECT schedule.id,
                schedule.group_id,
                group_row.name AS group_name,
                schedule.teacher_id,
                teacher.name AS teacher_name,
                schedule.room_id,
                room.name AS room_name,
                schedule.weekday,
                schedule.start_time,
                schedule.end_time,
                schedule.valid_from,
                schedule.valid_until,
                CASE WHEN schedule.group_id = ? THEN 1 ELSE 0 END AS group_conflict,
                CASE WHEN schedule.teacher_id = ? THEN 1 ELSE 0 END AS teacher_conflict,
                CASE WHEN ? != '' AND schedule.room_id = ? THEN 1 ELSE 0 END AS room_conflict
         FROM schedules schedule
         JOIN groups group_row
           ON group_row.id = schedule.group_id AND group_row.tenant_id = schedule.tenant_id
         LEFT JOIN teachers teacher
           ON teacher.id = schedule.teacher_id AND teacher.tenant_id = schedule.tenant_id
         LEFT JOIN rooms room
           ON room.id = schedule.room_id AND room.tenant_id = schedule.tenant_id
         WHERE schedule.tenant_id = ?
           AND schedule.is_recurring = 1
           AND schedule.status = 'active'
           AND schedule.weekday = ?
           AND schedule.start_time < ?
           AND schedule.end_time > ?
           AND COALESCE(NULLIF(schedule.valid_from, ''), '0001-01-01')
               <= COALESCE(NULLIF(?, ''), '9999-12-31')
           AND COALESCE(NULLIF(schedule.valid_until, ''), '9999-12-31')
               >= COALESCE(NULLIF(?, ''), '0001-01-01')
           AND (? IS NULL OR schedule.id != ?)
           AND (
             schedule.group_id = ?
             OR schedule.teacher_id = ?
             OR (? != '' AND schedule.room_id = ?)
           )
         ORDER BY schedule.start_time, schedule.id`,
      )
      .all(
        payload.groupId,
        payload.teacherId,
        payload.roomId || "",
        payload.roomId || "",
        tenantId,
        String(payload.weekday),
        payload.endTime,
        payload.startTime,
        payload.validUntil || "",
        payload.validFrom || "",
        excluded,
        excluded,
        payload.groupId,
        payload.teacherId,
        payload.roomId || "",
        payload.roomId || "",
      )
      .map((row) => ({
        id: row.id,
        groupId: row.group_id,
        groupName: row.group_name || "",
        teacherId: row.teacher_id || "",
        teacherName: row.teacher_name || "",
        roomId: row.room_id || "",
        roomName: row.room_name || "",
        weekday: Number(row.weekday),
        startTime: row.start_time,
        endTime: row.end_time,
        validFrom: row.valid_from || "",
        validUntil: row.valid_until || "",
        conflicts: [
          row.group_conflict ? "group" : "",
          row.teacher_conflict ? "teacher" : "",
          row.room_conflict ? "room" : "",
        ].filter(Boolean),
      }));
  }

  createGroupSchedule(tenantId, groupId, payload) {
    const group = this.db
      .prepare("SELECT branch_id FROM groups WHERE tenant_id = ? AND id = ? LIMIT 1")
      .get(tenantId, groupId);
    if (!group) return null;
    const timestamp = now();
    const seriesId = payload.seriesId || `schedule-series:${tenantId}:${id()}`;
    try {
      const result = this.db
        .prepare(
          `INSERT INTO schedules
           (tenant_id, branch_id, group_id, teacher_id, room_id, weekday, start_time, end_time,
            is_recurring, lesson_type, lesson_link, created_at, valid_from, valid_until, status, updated_at,
            series_id, version, change_reason, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'group', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .run(
          tenantId,
          group.branch_id || null,
          groupId,
          payload.teacherId,
          payload.roomId || null,
          String(payload.weekday),
          payload.startTime,
          payload.endTime,
          payload.lessonLink || "",
          timestamp,
          payload.validFrom || today(),
          payload.validUntil || null,
          payload.status || "active",
          timestamp,
          seriesId,
          payload.changeReason || "Initial schedule rule",
          payload.actorUserId || "system",
          payload.actorUserId || "system",
        );
      return this.groupSchedule(tenantId, result.lastInsertRowid);
    } catch (error) {
      if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) error.status = 409;
      throw error;
    }
  }

  updateGroupSchedule(tenantId, scheduleId, payload) {
    const existing = this.groupSchedule(tenantId, scheduleId);
    if (!existing) return null;
    try {
      this.db
        .prepare(
          `UPDATE schedules
           SET teacher_id = ?, room_id = ?, weekday = ?, start_time = ?, end_time = ?,
               lesson_link = ?, valid_from = ?, valid_until = ?, status = ?, updated_at = ?
           WHERE tenant_id = ? AND id = ?`,
        )
        .run(
          payload.teacherId,
          payload.roomId || null,
          String(payload.weekday),
          payload.startTime,
          payload.endTime,
          payload.lessonLink || "",
          payload.validFrom || existing.validFrom || today(),
          payload.validUntil || null,
          payload.status || existing.status,
          now(),
          tenantId,
          scheduleId,
        );
      return this.groupSchedule(tenantId, scheduleId);
    } catch (error) {
      if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) error.status = 409;
      throw error;
    }
  }

  disableGroupSchedule(tenantId, scheduleId) {
    const existing = this.groupSchedule(tenantId, scheduleId);
    if (!existing) return null;
    this.db
      .prepare("UPDATE schedules SET status = 'inactive', updated_at = ? WHERE tenant_id = ? AND id = ?")
      .run(now(), tenantId, scheduleId);
    return this.groupSchedule(tenantId, scheduleId);
  }

  lessonBySeriesOccurrence(tenantId, seriesId, occurrenceKey) {
    if (!seriesId || !occurrenceKey) return null;
    const row = this.db
      .prepare(
        `SELECT id FROM lessons
         WHERE tenant_id = ? AND schedule_series_id = ? AND occurrence_key = ?
         LIMIT 1`,
      )
      .get(tenantId, seriesId, occurrenceKey);
    return row ? this.lesson(tenantId, row.id) : null;
  }

  materializedSeriesCount(tenantId, seriesId, occurrenceKey) {
    if (!seriesId || !occurrenceKey) return 0;
    return Number(
      this.db
        .prepare(
          `SELECT COUNT(*) AS count FROM lessons
           WHERE tenant_id = ? AND schedule_series_id = ? AND occurrence_key >= ?`,
        )
        .get(tenantId, seriesId, occurrenceKey)?.count || 0,
    );
  }

  scheduleChangeRunByKey(tenantId, idempotencyKey) {
    if (!idempotencyKey) return null;
    return this.db
      .prepare("SELECT * FROM schedule_change_runs WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1")
      .get(tenantId, idempotencyKey);
  }

  insertScheduleEvent(tenantId, payload) {
    this.db
      .prepare(
        `INSERT INTO schedule_events
         (id, tenant_id, series_id, schedule_id, lesson_id, occurrence_key, run_id,
          actor_user_id, actor_role, action, reason, before_json, after_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id(),
        tenantId,
        payload.seriesId,
        payload.scheduleId,
        payload.lessonId || null,
        payload.occurrenceKey || null,
        payload.runId || null,
        payload.actorUserId || "system",
        payload.actorRole || "system",
        payload.action,
        payload.reason || "",
        payload.before ? JSON.stringify(payload.before) : null,
        payload.after ? JSON.stringify(payload.after) : null,
        now(),
      );
  }

  applyScheduleChange(tenantId, plan) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const reusedRun = this.scheduleChangeRunByKey(tenantId, plan.idempotencyKey);
      if (reusedRun) {
        if (
          Number(reusedRun.schedule_id) !== Number(plan.scheduleId) ||
          reusedRun.operation !== plan.operation ||
          reusedRun.request_fingerprint !== plan.requestFingerprint
        ) {
          const error = new Error("idempotencyKey was already used with a different schedule change");
          error.status = 409;
          throw error;
        }
        if (reusedRun.status !== "succeeded") {
          const error = new Error("Schedule change is already being processed");
          error.status = 409;
          throw error;
        }
        const result = parseJson(reusedRun.result_json, {});
        this.db.exec("COMMIT");
        return { ...result, reused: true };
      }

      const locked = this.groupSchedule(tenantId, plan.scheduleId);
      if (!locked || locked.seriesId !== plan.seriesId || locked.seriesVersion !== plan.expectedScheduleVersion) {
        const error = new Error("Schedule version changed; refresh the preview and retry");
        error.status = 409;
        throw error;
      }

      const timestamp = now();
      const runId = id();
      this.db
        .prepare(
          `INSERT INTO schedule_change_runs
           (id, tenant_id, series_id, schedule_id, operation, idempotency_key,
            request_fingerprint, status, result_json, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '{}', ?, ?)`,
        )
        .run(
          runId,
          tenantId,
          plan.seriesId,
          plan.scheduleId,
          plan.operation,
          plan.idempotencyKey,
          plan.requestFingerprint,
          plan.actorUserId || "system",
          timestamp,
        );

      let result;
      if (plan.scope === "this_occurrence") {
        if (this.lessonBySeriesOccurrence(tenantId, plan.seriesId, plan.occurrenceKey)) {
          const error = new Error("This occurrence is already materialized; edit the lesson directly");
          error.status = 409;
          throw error;
        }
        const lessonId = id();
        const branchId = plan.branchId || this.mainBranch(tenantId)?.id || null;
        this.db
          .prepare(
            `INSERT INTO lessons
             (id, tenant_id, branch_id, group_id, teacher_id, schedule_id, date, time,
              start_time, end_time, occurrence_date, status, lesson_type, is_trial,
              room_id, room_name, topic, homework, note, created_by, created_at, updated_by, updated_at,
              schedule_series_id, occurrence_key, override_mask, base_schedule_id, base_schedule_version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, '', '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            lessonId,
            tenantId,
            branchId,
            plan.groupId,
            plan.after.teacherId || null,
            plan.scheduleId,
            plan.after.date,
            `${plan.after.startTime} - ${plan.after.endTime}`,
            plan.after.startTime,
            plan.after.endTime,
            plan.occurrenceDate,
            plan.lessonType || "group",
            plan.lessonType === "trial" ? 1 : 0,
            plan.after.roomId || null,
            plan.after.roomName || "",
            plan.actorUserId || "system",
            timestamp,
            plan.actorUserId || "system",
            timestamp,
            plan.seriesId,
            plan.occurrenceKey,
            Number(plan.overrideMask || 0),
            plan.scheduleId,
            plan.expectedScheduleVersion,
          );
        const lesson = this.lesson(tenantId, lessonId);
        this.insertLessonEvent(
          tenantId,
          lessonId,
          { userId: plan.actorUserId, role: plan.actorRole },
          "created",
          plan.reason,
          null,
          lessonStateSnapshot(lesson),
        );
        this.insertScheduleEvent(tenantId, {
          seriesId: plan.seriesId,
          scheduleId: plan.scheduleId,
          lessonId,
          occurrenceKey: plan.occurrenceKey,
          runId,
          actorUserId: plan.actorUserId,
          actorRole: plan.actorRole,
          action: "occurrence_overridden",
          reason: plan.reason,
          before: plan.before,
          after: plan.after,
        });
        result = { scope: plan.scope, occurrenceKey: plan.occurrenceKey, schedule: locked, lesson };
      } else {
        const closed = this.db
          .prepare(
            `UPDATE schedules
             SET valid_until = ?, status = 'inactive', change_reason = ?, updated_by = ?, updated_at = ?
             WHERE tenant_id = ? AND id = ? AND series_id = ? AND version = ? AND status = 'active'`,
          )
          .run(
            plan.previousValidUntil,
            plan.reason,
            plan.actorUserId || "system",
            timestamp,
            tenantId,
            plan.scheduleId,
            plan.seriesId,
            plan.expectedScheduleVersion,
          );
        if (Number(closed.changes || 0) !== 1) {
          const error = new Error("Schedule version changed; refresh the preview and retry");
          error.status = 409;
          throw error;
        }

        let successor = null;
        if (plan.after.status === "active") {
          const inserted = this.db
            .prepare(
              `INSERT INTO schedules
               (tenant_id, branch_id, group_id, teacher_id, room_id, weekday, start_time, end_time,
                is_recurring, lesson_type, lesson_link, created_at, valid_from, valid_until, status, updated_at,
                series_id, supersedes_schedule_id, version, change_reason, created_by, updated_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              tenantId,
              plan.branchId || null,
              plan.groupId,
              plan.after.teacherId,
              plan.after.roomId || null,
              String(plan.after.weekday),
              plan.after.startTime,
              plan.after.endTime,
              plan.lessonType || "group",
              plan.after.lessonLink || "",
              timestamp,
              plan.occurrenceDate,
              plan.after.validUntil || null,
              timestamp,
              plan.seriesId,
              plan.scheduleId,
              plan.expectedScheduleVersion + 1,
              plan.reason,
              plan.actorUserId || "system",
              plan.actorUserId || "system",
            );
          successor = this.groupSchedule(tenantId, inserted.lastInsertRowid);
          const futureLessons = this.db
            .prepare(
              `SELECT id, date, occurrence_date, start_time, end_time, teacher_id, room_id,
                      room_name, override_mask, status
               FROM lessons
               WHERE tenant_id = ? AND schedule_series_id = ? AND occurrence_key >= ?
                 AND status IN ('waiting', 'planned')
               ORDER BY occurrence_key, id`,
            )
            .all(tenantId, plan.seriesId, plan.occurrenceKey);
          futureLessons.forEach((row) => {
            const beforeLesson = this.lesson(tenantId, row.id);
            const mask = Number(row.override_mask || 0);
            const targetDate = dateForWeekday(row.occurrence_date || row.date, successor.weekday);
            const lessonDate = mask & 1 ? row.date : targetDate;
            const occurrenceDate = mask & 1 ? row.occurrence_date || row.date : targetDate;
            const startTime = mask & 2 ? row.start_time : successor.startTime;
            const endTime = mask & 2 ? row.end_time : successor.endTime;
            const teacherId = mask & 4 ? row.teacher_id : successor.teacherId;
            const roomId = mask & 8 ? row.room_id : successor.roomId;
            const roomName = mask & 8 ? row.room_name : successor.roomName || "";
            this.db
              .prepare(
                `UPDATE lessons
                 SET schedule_id = ?, base_schedule_id = ?, base_schedule_version = ?,
                     date = ?, occurrence_date = ?, time = ?, start_time = ?, end_time = ?,
                     teacher_id = ?, room_id = ?, room_name = ?, updated_by = ?, updated_at = ?,
                     version = version + 1
                 WHERE tenant_id = ? AND id = ?`,
              )
              .run(
                successor.id,
                successor.id,
                successor.seriesVersion,
                lessonDate,
                occurrenceDate,
                `${startTime} - ${endTime}`,
                startTime,
                endTime,
                teacherId || null,
                roomId || null,
                roomName,
                plan.actorUserId || "system",
                timestamp,
                tenantId,
                row.id,
              );
            const afterLesson = this.lesson(tenantId, row.id);
            this.insertLessonEvent(
              tenantId,
              row.id,
              { userId: plan.actorUserId, role: plan.actorRole },
              "series_defaults_propagated",
              plan.reason,
              lessonStateSnapshot(beforeLesson),
              lessonStateSnapshot(afterLesson),
            );
          });
        }
        const predecessor = this.groupSchedule(tenantId, plan.scheduleId);
        this.insertScheduleEvent(tenantId, {
          seriesId: plan.seriesId,
          scheduleId: successor?.id || plan.scheduleId,
          occurrenceKey: plan.occurrenceKey,
          runId,
          actorUserId: plan.actorUserId,
          actorRole: plan.actorRole,
          action: successor ? "series_version_created" : "series_stopped",
          reason: plan.reason,
          before: plan.before,
          after: successor || null,
        });
        result = {
          scope: plan.scope,
          occurrenceKey: plan.occurrenceKey,
          predecessor,
          schedule: successor,
          materializedLessonsPreserved: plan.materializedLessonsPreserved,
        };
      }

      this.db
        .prepare(
          `UPDATE schedule_change_runs
           SET status = 'succeeded', result_json = ?, completed_at = ?
           WHERE tenant_id = ? AND id = ?`,
        )
        .run(JSON.stringify(result), timestamp, tenantId, runId);
      this.db.exec("COMMIT");
      return { ...result, reused: false };
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (String(error.code || "").startsWith("SQLITE_CONSTRAINT") && !error.status) error.status = 409;
      throw error;
    }
  }

  groupProfile(tenantId, groupId) {
    const group = this.group(tenantId, groupId);
    if (!group) return null;
    const currentDate = today();

    const activeMembers = this.db
      .prepare(
        `SELECT student.*, group_row.name AS group_name,
                guardian_link.relationship AS parent_relationship,
                guardian.email AS parent_email,
                COALESCE(NULLIF(student.telegram_chat_id, ''), guardian.telegram_chat_id, '') AS effective_telegram_chat_id,
                COALESCE((
                  SELECT SUM(CASE WHEN tx.type IN ('payment', 'discount') THEN tx.amount ELSE -tx.amount END)
                  FROM invoices_transactions tx
                  WHERE tx.tenant_id = student.tenant_id AND tx.student_id = student.id
                    AND COALESCE(tx.status, 'active') = 'active'
                ), student.balance, 0) AS ledger_balance,
                (SELECT COUNT(*) FROM attendance record
                 WHERE record.tenant_id = student.tenant_id AND record.student_id = student.id) AS attendance_total,
                (SELECT COUNT(*) FROM attendance record
                 WHERE record.tenant_id = student.tenant_id AND record.student_id = student.id
                   AND record.status IN ('present', 'late')) AS attendance_present
         FROM student_group_enrollments enrollment
         JOIN students student
           ON student.id = enrollment.student_id AND student.tenant_id = enrollment.tenant_id
         JOIN groups group_row
           ON group_row.id = enrollment.group_id AND group_row.tenant_id = enrollment.tenant_id
         LEFT JOIN student_guardians guardian_link
           ON guardian_link.tenant_id = student.tenant_id
          AND guardian_link.student_id = student.id
          AND guardian_link.is_primary = 1
         LEFT JOIN guardians guardian
           ON guardian.id = guardian_link.guardian_id AND guardian.tenant_id = guardian_link.tenant_id
         WHERE enrollment.tenant_id = ? AND enrollment.group_id = ?
           AND enrollment.status = 'active'
           AND enrollment.start_date <= ?
           AND (enrollment.end_date IS NULL OR enrollment.end_date = '' OR enrollment.end_date >= ?)
           AND student.status != 'left'
         ORDER BY student.name, student.id`,
      )
      .all(tenantId, groupId, currentDate, currentDate)
      .map(camelStudent);

    const memberHistory = this.db
      .prepare(
        `SELECT enrollment.*, student.name AS student_name
         FROM student_group_enrollments enrollment
         JOIN students student
           ON student.id = enrollment.student_id AND student.tenant_id = enrollment.tenant_id
         WHERE enrollment.tenant_id = ? AND enrollment.group_id = ?
           AND NOT (
             enrollment.status = 'active'
             AND enrollment.start_date <= ?
             AND (enrollment.end_date IS NULL OR enrollment.end_date = '' OR enrollment.end_date >= ?)
             AND student.status != 'left'
           )
         ORDER BY COALESCE(enrollment.end_date, enrollment.start_date) DESC, enrollment.created_at DESC`,
      )
      .all(tenantId, groupId, currentDate, currentDate)
      .map((row) => ({
        ...camelEnrollment(row),
        studentName: row.student_name || "",
      }));

    const teacherAssignments = this.db
      .prepare(
        `SELECT assignment.*, teacher.name AS teacher_name
         FROM group_teacher_assignments assignment
         JOIN groups group_row
           ON group_row.id = assignment.group_id AND group_row.tenant_id = assignment.tenant_id
         LEFT JOIN teachers teacher
           ON teacher.id = assignment.teacher_id AND teacher.tenant_id = assignment.tenant_id
         WHERE assignment.tenant_id = ? AND assignment.group_id = ?
         ORDER BY assignment.valid_from DESC, assignment.created_at DESC, assignment.id DESC`,
      )
      .all(tenantId, groupId)
      .map(camelGroupTeacherAssignment);

    const lessonSummaryRow = this.db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status IN ('waiting', 'planned') THEN 1 ELSE 0 END) AS planned,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
         FROM lessons
         WHERE tenant_id = ? AND group_id = ?`,
      )
      .get(tenantId, groupId);
    const lessonSummary = {
      total: Number(lessonSummaryRow?.total || 0),
      planned: Number(lessonSummaryRow?.planned || 0),
      completed: Number(lessonSummaryRow?.completed || 0),
      cancelled: Number(lessonSummaryRow?.cancelled || 0),
    };
    const lessonSelect = `SELECT lesson.*, group_row.name AS group_name, group_row.subject, group_row.room,
                                 COALESCE(lesson.teacher_id, group_row.teacher_id) AS effective_teacher_id,
                                 teacher.name AS teacher_name
                          FROM lessons lesson
                          JOIN groups group_row
                            ON group_row.id = lesson.group_id AND group_row.tenant_id = lesson.tenant_id
                          LEFT JOIN teachers teacher
                            ON teacher.id = COALESCE(lesson.teacher_id, group_row.teacher_id)
                           AND teacher.tenant_id = lesson.tenant_id`;
    const upcomingLessons = this.db
      .prepare(
        `${lessonSelect}
         WHERE lesson.tenant_id = ? AND lesson.group_id = ? AND lesson.date >= ?
           AND lesson.status IN ('waiting', 'planned')
         ORDER BY lesson.date, lesson.time, lesson.id
         LIMIT 20`,
      )
      .all(tenantId, groupId, currentDate)
      .map(camelLesson);
    const recentLessons = this.db
      .prepare(
        `${lessonSelect}
         WHERE lesson.tenant_id = ? AND lesson.group_id = ?
         ORDER BY lesson.date DESC, lesson.time DESC, lesson.id DESC
         LIMIT 20`,
      )
      .all(tenantId, groupId)
      .map(camelLesson);

    const attendanceRecords = this.db
      .prepare(
        `SELECT record.*, student.name AS student_name, student.parent_name,
                lesson.group_id, lesson.time AS lesson_time, lesson.date AS lesson_date,
                group_row.name AS group_name, group_row.subject,
                COALESCE(lesson.teacher_id, group_row.teacher_id) AS teacher_id
         FROM attendance record
         JOIN lessons lesson
           ON lesson.id = record.lesson_id AND lesson.tenant_id = record.tenant_id
         JOIN groups group_row
           ON group_row.id = lesson.group_id AND group_row.tenant_id = lesson.tenant_id
         JOIN students student
           ON student.id = record.student_id AND student.tenant_id = record.tenant_id
         WHERE record.tenant_id = ? AND lesson.group_id = ?
         ORDER BY lesson.date DESC, lesson.time DESC, record.created_at DESC
         LIMIT 100`,
      )
      .all(tenantId, groupId)
      .map(camelAttendance);
    const attendanceSummaryRow = this.db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN record.status = 'present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN record.status = 'absent' THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN record.status = 'late' THEN 1 ELSE 0 END) AS late,
                SUM(CASE WHEN record.status = 'excused' THEN 1 ELSE 0 END) AS excused
         FROM attendance record
         JOIN lessons lesson
           ON lesson.id = record.lesson_id AND lesson.tenant_id = record.tenant_id
         WHERE record.tenant_id = ? AND lesson.group_id = ?`,
      )
      .get(tenantId, groupId);
    const attendanceSummary = {
      total: Number(attendanceSummaryRow?.total || 0),
      present: Number(attendanceSummaryRow?.present || 0),
      absent: Number(attendanceSummaryRow?.absent || 0),
      late: Number(attendanceSummaryRow?.late || 0),
      excused: Number(attendanceSummaryRow?.excused || 0),
      rate: 0,
    };
    attendanceSummary.rate = attendanceSummary.total
      ? Math.round(((attendanceSummary.present + attendanceSummary.late) / attendanceSummary.total) * 100)
      : 0;

    const financeTotals = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN transaction_row.type = 'charge' THEN transaction_row.amount ELSE 0 END), 0) AS charged,
           COALESCE(SUM(CASE WHEN transaction_row.type = 'payment' THEN transaction_row.amount ELSE 0 END), 0) AS paid
         FROM invoices_transactions transaction_row
         WHERE transaction_row.tenant_id = ?
           AND COALESCE(transaction_row.status, 'active') = 'active'
           AND EXISTS (
             SELECT 1
             FROM student_group_enrollments enrollment
             WHERE enrollment.tenant_id = transaction_row.tenant_id
               AND enrollment.student_id = transaction_row.student_id
               AND enrollment.group_id = ?
               AND enrollment.start_date <= transaction_row.invoice_date
               AND (enrollment.end_date IS NULL OR enrollment.end_date = '' OR enrollment.end_date >= transaction_row.invoice_date)
           )`,
      )
      .get(tenantId, groupId);
    const debtors = activeMembers
      .map((student) => ({ ...student, debt: Math.max(0, Math.round(-Number(student.balance || 0))) }))
      .filter((student) => student.debt > 0)
      .sort((left, right) => right.debt - left.debt || left.name.localeCompare(right.name));

    return {
      group,
      members: { active: activeMembers, history: memberHistory },
      schedules: this.groupSchedules(tenantId, groupId, true),
      teacherAssignments,
      lessons: { summary: lessonSummary, upcoming: upcomingLessons, recent: recentLessons },
      attendance: { summary: attendanceSummary, records: attendanceRecords },
      finance: {
        monthlyPotential: activeMembers.length * Number(group.monthlyFee || 0),
        charged: Number(financeTotals?.charged || 0),
        paid: Number(financeTotals?.paid || 0),
        outstanding: debtors.reduce((sum, student) => sum + student.debt, 0),
        debtors,
      },
      rooms: this.rooms(tenantId),
    };
  }

  teachers(tenantId) {
    return this.db
      .prepare(
        `SELECT t.*, u.id AS user_id, u.username, u.status AS access_status,
                (SELECT COUNT(*) FROM groups g WHERE g.tenant_id = t.tenant_id AND g.teacher_id = t.id AND g.active = 1) AS groups_count,
                (SELECT COUNT(*) FROM students s JOIN groups g ON g.id = s.group_id AND g.tenant_id = s.tenant_id
                 WHERE g.tenant_id = t.tenant_id AND g.teacher_id = t.id AND g.active = 1 AND s.status != 'left') AS students_count,
                (SELECT COALESCE(SUM(
                  (CAST(substr(sc.end_time, 1, 2) AS INTEGER) * 60 + CAST(substr(sc.end_time, 4, 2) AS INTEGER)) -
                  (CAST(substr(sc.start_time, 1, 2) AS INTEGER) * 60 + CAST(substr(sc.start_time, 4, 2) AS INTEGER))
                ), 0) FROM schedules sc WHERE sc.tenant_id = t.tenant_id AND sc.teacher_id = t.id AND sc.is_recurring = 1) AS weekly_minutes,
                (SELECT COUNT(*) FROM lessons l JOIN groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
                 WHERE l.tenant_id = t.tenant_id AND COALESCE(l.teacher_id, g.teacher_id) = t.id AND l.status = 'completed') AS completed_lessons
         FROM teachers t
         LEFT JOIN users u ON u.id = t.id AND u.tenant_id = t.tenant_id AND u.role = 'teacher'
         WHERE t.tenant_id = ?
         ORDER BY CASE t.status WHEN 'active' THEN 0 ELSE 1 END, t.name`,
      )
      .all(tenantId)
      .map(camelTeacher);
  }

  teacher(tenantId, teacherId) {
    return this.teachers(tenantId).find((teacher) => teacher.id === teacherId) || null;
  }

  teacherDetails(tenantId, teacherId) {
    const teacher = this.teacher(tenantId, teacherId);
    if (!teacher) return null;
    const groups = this.db
      .prepare(
        `SELECT g.*, t.name AS teacher_name,
                (SELECT COUNT(*) FROM students s WHERE s.tenant_id = g.tenant_id AND s.group_id = g.id AND s.status != 'left') AS students_count
         FROM groups g JOIN teachers t ON t.id = g.teacher_id AND t.tenant_id = g.tenant_id
         WHERE g.tenant_id = ? AND g.teacher_id = ? ORDER BY g.active DESC, g.name`,
      )
      .all(tenantId, teacherId)
      .map(camelGroup);
    const upcomingLessons = this.db
      .prepare(
        `SELECT l.*, g.name AS group_name, g.subject, g.room, COALESCE(l.teacher_id, g.teacher_id) AS effective_teacher_id, t.name AS teacher_name
         FROM lessons l
         JOIN groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
         JOIN teachers t ON t.id = COALESCE(l.teacher_id, g.teacher_id) AND t.tenant_id = g.tenant_id
         WHERE l.tenant_id = ? AND COALESCE(l.teacher_id, g.teacher_id) = ? AND l.date >= ? AND l.status != 'cancelled'
         ORDER BY l.date, l.time LIMIT 20`,
      )
      .all(tenantId, teacherId, today())
      .map(camelLesson);
    return { teacher, groups, workingHours: this.teacherWorkingHours(tenantId, teacherId), upcomingLessons };
  }

  createTeacher(tenantId, payload) {
    const teacherId = id();
    const createdAt = now();
    const branchId = payload.branchId || this.mainBranch(tenantId)?.id || null;
    this.db.exec("BEGIN");
    try {
      this.db.prepare(
        `INSERT INTO teachers (id, tenant_id, branch_id, name, phone, email, specialization, employment_type, status, hired_at, max_weekly_minutes, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      ).run(teacherId, tenantId, branchId, payload.name, payload.phone || "", payload.email || "", payload.specialization || "", payload.employmentType, payload.hiredAt || null, payload.maxWeeklyMinutes, payload.note || "", createdAt);
      if (payload.accessEnabled) {
        this.db.prepare("INSERT INTO users (id, tenant_id, username, password, name, role, status) VALUES (?, ?, ?, ?, ?, 'teacher', 'active')")
          .run(teacherId, tenantId, payload.username, hashPassword(payload.password), payload.name);
        this.db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id, tenant_id, created_at) VALUES (?, ?, ?, ?)")
          .run(teacherId, `${tenantId}_role_teacher`, tenantId, createdAt);
        if (branchId) {
          this.db.prepare("INSERT OR IGNORE INTO user_branch_access (tenant_id, user_id, branch_id, created_at) VALUES (?, ?, ?, ?)")
            .run(tenantId, teacherId, branchId, createdAt);
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (String(error.message || "").includes("UNIQUE")) {
        const conflict = new Error("Username already exists");
        conflict.status = 409;
        throw conflict;
      }
      throw error;
    }
    return this.teacher(tenantId, teacherId);
  }

  updateTeacher(tenantId, teacherId, payload) {
    const existing = this.teacher(tenantId, teacherId);
    if (!existing) return null;
    const branchId = payload.branchId || existing.branchId || this.mainBranch(tenantId)?.id || null;
    this.db.exec("BEGIN");
    try {
      this.db.prepare(
        `UPDATE teachers SET branch_id = ?, name = ?, phone = ?, email = ?, specialization = ?, employment_type = ?,
         hired_at = ?, max_weekly_minutes = ?, note = ? WHERE tenant_id = ? AND id = ?`,
      ).run(branchId, payload.name, payload.phone || "", payload.email || "", payload.specialization || "", payload.employmentType, payload.hiredAt || null, payload.maxWeeklyMinutes, payload.note || "", tenantId, teacherId);
      const user = this.db.prepare("SELECT id FROM users WHERE tenant_id = ? AND id = ? AND role = 'teacher'").get(tenantId, teacherId);
      if (payload.accessEnabled && !user) {
        this.db.prepare("INSERT INTO users (id, tenant_id, username, password, name, role, status) VALUES (?, ?, ?, ?, ?, 'teacher', 'active')")
          .run(teacherId, tenantId, payload.username, hashPassword(payload.password), payload.name);
        this.db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id, tenant_id, created_at) VALUES (?, ?, ?, ?)")
          .run(teacherId, `${tenantId}_role_teacher`, tenantId, now());
      } else if (user) {
        this.db.prepare("UPDATE users SET username = ?, name = ?, status = ? WHERE tenant_id = ? AND id = ?")
          .run(payload.username || existing.username, payload.name, payload.accessEnabled ? "active" : "inactive", tenantId, teacherId);
        if (payload.password) this.db.prepare("UPDATE users SET password = ? WHERE tenant_id = ? AND id = ?").run(hashPassword(payload.password), tenantId, teacherId);
        if (!payload.accessEnabled) this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(teacherId);
      }
      if (branchId && payload.accessEnabled) {
        this.db.prepare("INSERT OR IGNORE INTO user_branch_access (tenant_id, user_id, branch_id, created_at) VALUES (?, ?, ?, ?)")
          .run(tenantId, teacherId, branchId, now());
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (String(error.message || "").includes("UNIQUE")) {
        const conflict = new Error("Username already exists");
        conflict.status = 409;
        throw conflict;
      }
      throw error;
    }
    return this.teacher(tenantId, teacherId);
  }

  archiveTeacher(tenantId, teacherId) {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE teachers SET status = 'inactive' WHERE tenant_id = ? AND id = ?").run(tenantId, teacherId);
      this.db.prepare("UPDATE users SET status = 'inactive' WHERE tenant_id = ? AND id = ? AND role = 'teacher'").run(tenantId, teacherId);
      this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(teacherId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.teacher(tenantId, teacherId);
  }

  restoreTeacher(tenantId, teacherId) {
    this.db.prepare("UPDATE teachers SET status = 'active' WHERE tenant_id = ? AND id = ?").run(tenantId, teacherId);
    return this.teacher(tenantId, teacherId);
  }

  resetTeacherPassword(tenantId, teacherId, password) {
    const result = this.db.prepare("UPDATE users SET password = ? WHERE tenant_id = ? AND id = ? AND role = 'teacher'").run(hashPassword(password), tenantId, teacherId);
    if (!result.changes) return null;
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(teacherId);
    return { success: true };
  }

  userPermissions(tenantId, userId, role) {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT rp.permission
         FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         WHERE ur.tenant_id = ? AND ur.user_id = ?
         ORDER BY rp.permission`,
      )
      .all(tenantId, userId);
    if (rows.length) return rows.map((row) => row.permission);
    if (role === "admin") {
      return [
        "students.read",
        "students.manage",
        "groups.read",
        "groups.manage",
        "lessons.read",
        "lessons.manage",
        "attendance.read",
        "attendance.manage",
        "payments.read",
        "payments.manage",
        "payments.export",
        "leads.read",
        "leads.manage",
        "tasks.read",
        "tasks.manage",
        "settings.manage",
        "branches.manage",
        "subscriptions.manage",
        "finance.manage",
        "lesson_finance.read",
        "lesson_finance.confirm",
        "lesson_finance.reverse",
        "payroll.manage",
        "finance_periods.manage",
      ];
    }
    if (role === "teacher") return ["students.read", "groups.read", "lessons.read", "attendance.read", "attendance.manage", "tasks.read"];
    return [];
  }

  roles(tenantId) {
    return this.db.prepare("SELECT * FROM roles WHERE tenant_id = ? ORDER BY rank DESC, name").all(tenantId).map(camelRole);
  }

  branches(tenantId) {
    return this.db.prepare("SELECT * FROM branches WHERE tenant_id = ? ORDER BY is_main DESC, name").all(tenantId).map(camelBranch);
  }

  branch(tenantId, branchId) {
    const row = this.db.prepare("SELECT * FROM branches WHERE tenant_id = ? AND id = ?").get(tenantId, branchId);
    return row ? camelBranch(row) : null;
  }

  mainBranch(tenantId) {
    const row = this.db.prepare("SELECT * FROM branches WHERE tenant_id = ? AND is_main = 1 LIMIT 1").get(tenantId);
    return row ? camelBranch(row) : null;
  }

  createBranch(tenantId, payload) {
    const row = {
      id: id(),
      tenantId,
      name: payload.name,
      status: payload.status || "active",
      isMain: Boolean(payload.isMain),
      createdAt: now(),
    };
    this.db.exec("BEGIN");
    try {
      if (row.isMain) this.db.prepare("UPDATE branches SET is_main = 0 WHERE tenant_id = ?").run(tenantId);
      this.db
        .prepare("INSERT INTO branches (id, tenant_id, name, status, is_main, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(row.id, tenantId, row.name, row.status, row.isMain ? 1 : 0, row.createdAt);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.branch(tenantId, row.id);
  }

  lessons(tenantId) {
    return this.db
	      .prepare(
	        `SELECT l.*, g.name AS group_name, g.subject, g.room,
	                COALESCE(l.teacher_id, schedule.teacher_id, g.teacher_id) AS effective_teacher_id,
	                COALESCE(l.room_id, schedule.room_id) AS effective_room_id,
	                COALESCE(NULLIF(l.room_name, ''), room.name, g.room, '') AS effective_room_name,
	                t.name AS teacher_name
	         FROM lessons l
	         JOIN groups g ON g.id = l.group_id AND g.tenant_id = ?
	         LEFT JOIN schedules schedule ON schedule.id = l.schedule_id AND schedule.tenant_id = l.tenant_id
	         LEFT JOIN teachers t ON t.id = COALESCE(l.teacher_id, schedule.teacher_id, g.teacher_id) AND t.tenant_id = ?
	         LEFT JOIN rooms room ON room.id = COALESCE(l.room_id, schedule.room_id) AND room.tenant_id = l.tenant_id
	         WHERE l.tenant_id = ?
	         ORDER BY l.date, l.time`,
	      )
	      .all(tenantId, tenantId, tenantId)
	      .map(camelLesson);
  }

  lessonsForTeacher(tenantId, teacherId) {
    return this.db
      .prepare(
        `SELECT l.*, g.name AS group_name, g.subject, g.room,
                COALESCE(l.teacher_id, schedule.teacher_id, g.teacher_id) AS effective_teacher_id,
                COALESCE(l.room_id, schedule.room_id) AS effective_room_id,
                COALESCE(NULLIF(l.room_name, ''), room.name, g.room, '') AS effective_room_name,
                t.name AS teacher_name
         FROM lessons l
         JOIN groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
         LEFT JOIN schedules schedule ON schedule.id = l.schedule_id AND schedule.tenant_id = l.tenant_id
         LEFT JOIN teachers t ON t.id = COALESCE(l.teacher_id, schedule.teacher_id, g.teacher_id) AND t.tenant_id = g.tenant_id
         LEFT JOIN rooms room ON room.id = COALESCE(l.room_id, schedule.room_id) AND room.tenant_id = l.tenant_id
         WHERE l.tenant_id = ? AND COALESCE(l.teacher_id, schedule.teacher_id, g.teacher_id) = ?
         ORDER BY l.date, l.time`,
      )
      .all(tenantId, teacherId)
      .map(camelLesson);
  }

  weeklySchedule(tenantId, startDate, endDate, teacherId = null, occurrenceKey = isoWeekKey(startDate)) {
    return this.db
      .prepare(
        `WITH requested AS (
           SELECT ? AS start_date, ? AS end_date
         ), calendar_rows AS (
           SELECT
             'schedule_' || schedule.id || '_' || date(requested.start_date, '+' || (CAST(schedule.weekday AS INTEGER) - 1) || ' day') AS id,
             'schedule' AS row_kind,
             schedule.group_id,
             group_row.name AS group_name,
             group_row.subject,
             schedule.teacher_id,
             teacher.name AS teacher_name,
             schedule.room_id,
             COALESCE(room.name, group_row.room, '') AS room_name,
             schedule.weekday,
             schedule.start_time,
             schedule.end_time,
             schedule.id AS schedule_id,
             schedule.lesson_link,
             'planned' AS status,
             date(requested.start_date, '+' || (CAST(schedule.weekday AS INTEGER) - 1) || ' day') AS lesson_date,
             date(requested.start_date, '+' || (CAST(schedule.weekday AS INTEGER) - 1) || ' day') AS occurrence_date,
             schedule.series_id AS schedule_series_id,
             ? AS occurrence_key
           FROM schedules schedule
           CROSS JOIN requested
           JOIN groups group_row ON group_row.id = schedule.group_id AND group_row.tenant_id = schedule.tenant_id
           LEFT JOIN teachers teacher ON teacher.id = schedule.teacher_id AND teacher.tenant_id = schedule.tenant_id
           LEFT JOIN rooms room ON room.id = schedule.room_id AND room.tenant_id = schedule.tenant_id
           WHERE schedule.tenant_id = ?
             AND schedule.is_recurring = 1
             AND (schedule.status = 'active'
                  OR (schedule.status = 'inactive' AND schedule.valid_until IS NOT NULL AND schedule.valid_until != ''))
             AND group_row.status = 'active'
             AND date(requested.start_date, '+' || (CAST(schedule.weekday AS INTEGER) - 1) || ' day')
                 BETWEEN requested.start_date AND requested.end_date
             AND COALESCE(NULLIF(schedule.valid_from, ''), group_row.start_date, requested.start_date)
                 <= date(requested.start_date, '+' || (CAST(schedule.weekday AS INTEGER) - 1) || ' day')
             AND (schedule.valid_until IS NULL OR schedule.valid_until = '' OR schedule.valid_until
                 >= date(requested.start_date, '+' || (CAST(schedule.weekday AS INTEGER) - 1) || ' day'))
             AND (group_row.start_date IS NULL OR group_row.start_date = '' OR group_row.start_date
                 <= date(requested.start_date, '+' || (CAST(schedule.weekday AS INTEGER) - 1) || ' day'))
             AND (group_row.end_date IS NULL OR group_row.end_date = '' OR group_row.end_date
                 >= date(requested.start_date, '+' || (CAST(schedule.weekday AS INTEGER) - 1) || ' day'))
             AND NOT EXISTS (
               SELECT 1 FROM lessons occurrence
               WHERE occurrence.tenant_id = schedule.tenant_id
                 AND (
                   (schedule.series_id IS NOT NULL AND schedule.series_id != ''
                    AND occurrence.schedule_series_id = schedule.series_id
                    AND occurrence.occurrence_key = ?)
                   OR
                   (occurrence.schedule_id = schedule.id
                    AND COALESCE(occurrence.occurrence_date, occurrence.date)
                        = date(requested.start_date, '+' || (CAST(schedule.weekday AS INTEGER) - 1) || ' day'))
                 )
             )

           UNION ALL

           SELECT
             lesson.id AS id,
             'lesson' AS row_kind,
             lesson.group_id,
             group_row.name AS group_name,
             group_row.subject,
             COALESCE(lesson.teacher_id, schedule.teacher_id, group_row.teacher_id) AS teacher_id,
             teacher.name AS teacher_name,
             COALESCE(lesson.room_id, schedule.room_id) AS room_id,
             COALESCE(NULLIF(lesson.room_name, ''), room.name, group_row.room, '') AS room_name,
             CAST(CASE strftime('%w', lesson.date) WHEN '0' THEN 7 ELSE strftime('%w', lesson.date) END AS TEXT) AS weekday,
             COALESCE(NULLIF(lesson.start_time, ''), schedule.start_time,
               TRIM(SUBSTR(REPLACE(lesson.time, '–', '-'), 1, INSTR(REPLACE(lesson.time, '–', '-'), '-') - 1))) AS start_time,
             COALESCE(NULLIF(lesson.end_time, ''), schedule.end_time,
               TRIM(SUBSTR(REPLACE(lesson.time, '–', '-'), INSTR(REPLACE(lesson.time, '–', '-'), '-') + 1))) AS end_time,
             lesson.schedule_id,
             COALESCE(schedule.lesson_link, '') AS lesson_link,
             CASE WHEN lesson.status = 'waiting' THEN 'planned' ELSE lesson.status END AS status,
             lesson.date AS lesson_date,
             lesson.occurrence_date,
             lesson.schedule_series_id,
             lesson.occurrence_key
           FROM lessons lesson
           CROSS JOIN requested
           JOIN groups group_row ON group_row.id = lesson.group_id AND group_row.tenant_id = lesson.tenant_id
           LEFT JOIN schedules schedule ON schedule.id = lesson.schedule_id AND schedule.tenant_id = lesson.tenant_id
           LEFT JOIN teachers teacher ON teacher.id = COALESCE(lesson.teacher_id, schedule.teacher_id, group_row.teacher_id)
             AND teacher.tenant_id = lesson.tenant_id
           LEFT JOIN rooms room ON room.id = COALESCE(lesson.room_id, schedule.room_id) AND room.tenant_id = lesson.tenant_id
           WHERE lesson.tenant_id = ? AND lesson.date BETWEEN requested.start_date AND requested.end_date
         )
         SELECT * FROM calendar_rows
         WHERE (? IS NULL OR teacher_id = ?)
         ORDER BY CAST(weekday AS INTEGER), start_time, CASE row_kind WHEN 'lesson' THEN 0 ELSE 1 END, id`,
      )
      .all(startDate, endDate, occurrenceKey, tenantId, occurrenceKey, tenantId, teacherId, teacherId)
      .map(camelScheduleLesson);
  }

  payments(tenantId) {
    return this.db.prepare("SELECT * FROM payments WHERE tenant_id = ? AND COALESCE(status, 'active') = 'active' ORDER BY created_at DESC").all(tenantId).map(camelPayment);
  }

  payment(tenantId, paymentId) {
    const row = this.db.prepare("SELECT * FROM payments WHERE tenant_id = ? AND id = ? AND COALESCE(status, 'active') = 'active' LIMIT 1").get(tenantId, paymentId);
    return row ? camelPayment(row) : null;
  }

  paymentLedgerTransaction(tenantId, payment) {
    if (!payment) return null;
    const linkedRow = this.db
      .prepare(
        `SELECT *
         FROM invoices_transactions
         WHERE tenant_id = ?
           AND type = 'payment'
           AND description LIKE ?
           AND COALESCE(status, 'active') = 'active'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(tenantId, `%payment:${payment.id}%`);
    if (linkedRow) return camelTransaction(linkedRow);
    const row = this.db
      .prepare(
        `SELECT *
         FROM invoices_transactions
         WHERE tenant_id = ?
           AND student_id = ?
           AND type = 'payment'
           AND amount = ?
           AND invoice_date = ?
           AND COALESCE(status, 'active') = 'active'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(tenantId, payment.studentId, payment.amount, String(payment.createdAt || "").slice(0, 10) || today());
    return row ? camelTransaction(row) : null;
  }

  messages(tenantId) {
    return this.db.prepare("SELECT * FROM messages WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId).map(camelMessage);
  }

  leads(tenantId) {
    return this.db
      .prepare(
        `SELECT l.*, ps.id AS stage_id, ps.name AS stage_name
         FROM leads l
         LEFT JOIN pipeline_stages ps ON ps.tenant_id = l.tenant_id AND ps.id = l.stage
         WHERE l.tenant_id = ?
         ORDER BY l.created_at DESC`,
      )
      .all(tenantId)
      .map(camelLead);
  }

  pipelineStages(tenantId) {
    return this.db
      .prepare("SELECT * FROM pipeline_stages WHERE tenant_id = ? ORDER BY sort_order ASC, name ASC")
      .all(tenantId)
      .map(camelPipelineStage);
  }

  pipelineStage(tenantId, stageId) {
    const row = this.db.prepare("SELECT * FROM pipeline_stages WHERE tenant_id = ? AND id = ?").get(tenantId, stageId);
    return row ? camelPipelineStage(row) : null;
  }

  lead(tenantId, leadId) {
    const row = this.db
      .prepare(
        `SELECT l.*, ps.id AS stage_id, ps.name AS stage_name
         FROM leads l
         LEFT JOIN pipeline_stages ps ON ps.tenant_id = l.tenant_id AND ps.id = l.stage
         WHERE l.tenant_id = ? AND l.id = ?`,
      )
      .get(tenantId, leadId);
    return row ? camelLead(row) : null;
  }

  auditLogs(tenantId) {
    return this.db.prepare("SELECT * FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 25").all(tenantId).map(camelAudit);
  }

  adminDashboard(tenantId) {
    const attendance = this.attendanceCounts(tenantId);
    const stats = {
      students: this.db.prepare("SELECT COUNT(*) AS count FROM students WHERE tenant_id = ? AND status != 'left'").get(tenantId).count,
      groups: this.db.prepare("SELECT COUNT(*) AS count FROM groups WHERE tenant_id = ?").get(tenantId).count,
      teachers: this.db.prepare("SELECT COUNT(*) AS count FROM teachers WHERE tenant_id = ? AND status = 'active'").get(tenantId).count,
      lessonsToday: this.db.prepare("SELECT COUNT(*) AS count FROM lessons WHERE tenant_id = ? AND date = ?").get(tenantId, today()).count,
      revenueToday: Number(
        this.db
          .prepare(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM payments
             WHERE tenant_id = ? AND COALESCE(status, 'active') = 'active'
               AND substr(created_at, 1, 10) = ?`,
          )
          .get(tenantId, today()).total || 0,
      ),
      present: attendance.present,
      absent: attendance.absent,
      late: attendance.late,
      excused: attendance.excused,
      queuedMessages: this.db.prepare("SELECT COUNT(*) AS count FROM messages WHERE tenant_id = ? AND status = 'queued'").get(tenantId).count,
      debtTotal: Number(this.db.prepare("SELECT COALESCE(SUM(debt), 0) AS total FROM students WHERE tenant_id = ? AND status != 'left'").get(tenantId).total || 0),
    };
    const lessons = this.db
      .prepare(
        `SELECT l.*, g.name AS group_name, g.subject, g.room, COALESCE(l.teacher_id, g.teacher_id) AS effective_teacher_id, t.name AS teacher_name
         FROM lessons l
         JOIN groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
         LEFT JOIN teachers t ON t.id = COALESCE(l.teacher_id, g.teacher_id) AND t.tenant_id = g.tenant_id
         WHERE l.tenant_id = ? AND l.date = ?
         ORDER BY l.time
         LIMIT 20`,
      )
      .all(tenantId, today())
      .map(camelLesson);
    const debtors = this.db
      .prepare(
        `SELECT s.*, g.name AS group_name, sg.relationship AS parent_relationship, guardian.email AS parent_email,
                COALESCE(NULLIF(s.telegram_chat_id, ''), guardian.telegram_chat_id, '') AS effective_telegram_chat_id,
                COALESCE((
                  SELECT SUM(CASE WHEN it.effect = 'credit' THEN it.amount WHEN it.effect = 'debit' THEN -it.amount WHEN it.type IN ('payment', 'discount') THEN it.amount ELSE -it.amount END)
                  FROM invoices_transactions it
                  WHERE it.student_id = s.id AND it.tenant_id = s.tenant_id
                    AND COALESCE(it.status, 'active') = 'active'
                ), s.balance, 0) AS ledger_balance,
                (SELECT COUNT(*) FROM attendance a WHERE a.tenant_id = s.tenant_id AND a.student_id = s.id) AS attendance_total,
                (SELECT COUNT(*) FROM attendance a WHERE a.tenant_id = s.tenant_id AND a.student_id = s.id AND a.status IN ('present', 'late')) AS attendance_present
         FROM students s
         LEFT JOIN groups g ON g.id = s.group_id AND g.tenant_id = s.tenant_id
         LEFT JOIN student_guardians sg ON sg.tenant_id = s.tenant_id AND sg.student_id = s.id AND sg.is_primary = 1
         LEFT JOIN guardians guardian ON guardian.id = sg.guardian_id AND guardian.tenant_id = sg.tenant_id
         WHERE s.tenant_id = ? AND s.status != 'left' AND s.debt > 0
         ORDER BY s.debt DESC, s.name
         LIMIT 20`,
      )
      .all(tenantId)
      .map(camelStudent);
    const messages = this.db
      .prepare("SELECT * FROM messages WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 8")
      .all(tenantId)
      .map(camelMessage);
    return { stats, lessons, debtors, messages };
  }

  teacherDashboard(tenantId, teacherId) {
    const lessonsToday = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM lessons l
         JOIN groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
         WHERE l.tenant_id = ? AND COALESCE(l.teacher_id, g.teacher_id) = ? AND l.date = ?`,
      )
      .get(tenantId, teacherId, today()).count;
    return {
      stats: {
        students: this.db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM students s
             JOIN groups g ON g.id = s.group_id AND g.tenant_id = s.tenant_id
             WHERE s.tenant_id = ? AND g.teacher_id = ? AND s.status != 'left'`,
          )
          .get(tenantId, teacherId).count,
        groups: this.db.prepare("SELECT COUNT(*) AS count FROM groups WHERE tenant_id = ? AND teacher_id = ?").get(tenantId, teacherId).count,
        teachers: 1,
        lessonsToday,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      },
      lessons: [],
      debtors: [],
      messages: [],
    };
  }

  attendanceCounts(tenantId) {
    const rows = this.db.prepare("SELECT status, COUNT(*) AS count FROM attendance WHERE tenant_id = ? GROUP BY status").all(tenantId);
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    rows.forEach((row) => {
      counts[row.status] = row.count;
    });
    return counts;
  }

  attendanceRecords(tenantId) {
    return this.db
	      .prepare(
	        `SELECT a.*, s.name AS student_name, s.parent_name, l.group_id, l.time AS lesson_time, l.date AS lesson_date,
	                g.name AS group_name, g.subject, COALESCE(l.teacher_id, g.teacher_id) AS teacher_id
	         FROM attendance a
	         JOIN students s ON s.id = a.student_id AND s.tenant_id = ?
	         JOIN lessons l ON l.id = a.lesson_id AND l.tenant_id = ?
	         JOIN groups g ON g.id = l.group_id AND g.tenant_id = ?
	         WHERE a.tenant_id = ?
	         ORDER BY a.created_at DESC`,
	      )
	      .all(tenantId, tenantId, tenantId, tenantId)
	      .map(camelAttendance);
  }

  attendanceRecordsForTeacher(tenantId, teacherId) {
    return this.db
      .prepare(
        `SELECT a.*, s.name AS student_name, s.parent_name, l.group_id, l.time AS lesson_time, l.date AS lesson_date,
                g.name AS group_name, g.subject, COALESCE(l.teacher_id, g.teacher_id) AS teacher_id
         FROM attendance a
         JOIN students s ON s.id = a.student_id AND s.tenant_id = a.tenant_id
         JOIN lessons l ON l.id = a.lesson_id AND l.tenant_id = a.tenant_id
         JOIN groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
         WHERE a.tenant_id = ? AND COALESCE(l.teacher_id, g.teacher_id) = ?
         ORDER BY a.created_at DESC`,
      )
      .all(tenantId, teacherId)
      .map(camelAttendance);
  }

  getStudentBalance(tenantId, studentId) {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN effect = 'credit' THEN amount WHEN effect = 'debit' THEN -amount WHEN type IN ('payment', 'discount') THEN amount ELSE -amount END), 0) AS balance
         FROM invoices_transactions
         WHERE tenant_id = ? AND student_id = ? AND COALESCE(status, 'active') = 'active'`,
      )
      .get(tenantId, studentId);
    return Number(row?.balance || 0);
  }

  syncStudentBalance(tenantId, studentId) {
    const balance = this.getStudentBalance(tenantId, studentId);
    this.db
      .prepare("UPDATE students SET balance = ?, debt = ? WHERE tenant_id = ? AND id = ?")
      .run(balance, balance < 0 ? Math.round(Math.abs(balance)) : 0, tenantId, studentId);
    return balance;
  }

  transactionById(tenantId, transactionId) {
    const row = this.db.prepare("SELECT * FROM invoices_transactions WHERE tenant_id = ? AND id = ?").get(tenantId, transactionId);
    return row ? camelTransaction(row) : null;
  }

  getStudentLedger(tenantId, studentId) {
    return this.db
      .prepare(
        `SELECT *
         FROM invoices_transactions
         WHERE tenant_id = ? AND student_id = ?
           AND COALESCE(status, 'active') = 'active'
         ORDER BY invoice_date DESC, created_at DESC, id DESC
         LIMIT 50`,
      )
      .all(tenantId, studentId)
      .map(camelTransaction);
  }

  insertTransaction(tenantId, studentId, payload) {
    const idempotencyKey = String(payload.idempotencyKey || "").trim();
    const effect = payload.effect || (["payment", "discount"].includes(payload.type) ? "credit" : "debit");
    if (idempotencyKey) {
      const existing = this.db
        .prepare("SELECT * FROM invoices_transactions WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1")
        .get(tenantId, idempotencyKey);
      if (existing) {
        const samePayload = existing.student_id === studentId
          && existing.type === payload.type
          && Number(existing.amount) === Number(payload.amount)
          && (existing.effect || (["payment", "discount"].includes(existing.type) ? "credit" : "debit")) === effect
          && String(existing.currency || "UZS") === String(payload.currency || "UZS")
          && String(existing.source_type || "") === String(payload.sourceType || "")
          && String(existing.source_id || "") === String(payload.sourceId || "");
        if (!samePayload || (payload.requestFingerprint && existing.request_fingerprint !== payload.requestFingerprint)) {
          const error = new Error("idempotencyKey was already used with a different transaction");
          error.status = 409;
          throw error;
        }
        return { ...camelTransaction(existing), reused: true };
      }
    }
    const createdAt = now();
    const invoiceDate = payload.invoiceDate || today();
    const branchId = payload.branchId || this.mainBranch(tenantId)?.id || null;
    const result = this.db
      .prepare(
        `INSERT INTO invoices_transactions
         (tenant_id, branch_id, student_id, type, effect, amount, currency, description,
          invoice_date, created_at, status, idempotency_key, request_fingerprint,
          account_id, category_id, source_type, source_id, reversal_of_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        branchId,
        studentId,
        payload.type,
        effect,
        payload.amount,
        payload.currency || "UZS",
        payload.description || "",
        invoiceDate,
        createdAt,
        idempotencyKey || null,
        payload.requestFingerprint || null,
        payload.accountId || null,
        payload.categoryId || null,
        payload.sourceType || null,
        payload.sourceId || null,
        payload.reversalOfId || null,
      );
    return { ...this.transactionById(tenantId, result.lastInsertRowid), reused: false };
  }

  insertPayment(tenantId, student, payload) {
    const idempotencyKey = String(payload.idempotencyKey || "").trim();
    const branchId = payload.branchId || this.mainBranch(tenantId)?.id || "";
    if (idempotencyKey) {
      const existing = this.db
        .prepare("SELECT * FROM payments WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1")
        .get(tenantId, idempotencyKey);
      if (existing) {
        const samePayload = existing.student_id === student.id
          && Number(existing.amount) === Number(payload.amount)
          && existing.type === payload.type
          && String(existing.branch_id || "") === branchId
          && String(existing.account_id || "") === String(payload.accountId || "")
          && String(existing.category_id || "") === String(payload.categoryId || "");
        if (!samePayload) {
          const error = new Error("idempotencyKey was already used with a different payment");
          error.status = 409;
          throw error;
        }
        return { ...camelPayment(existing), reused: true };
      }
    }
    const row = {
      id: id(),
      tenantId,
      branchId,
      studentId: student.id,
      studentName: student.name,
      amount: payload.amount,
      type: payload.type,
      createdAt: now(),
      status: "active",
      idempotencyKey,
      reused: false,
    };
    this.db.prepare("INSERT INTO payments (id, tenant_id, branch_id, student_id, student_name, amount, type, created_at, status, idempotency_key, account_id, category_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)").run(
      row.id,
      tenantId,
      row.branchId || null,
      student.id,
      student.name,
      row.amount,
      row.type,
      row.createdAt,
      idempotencyKey || null,
      payload.accountId || null,
      payload.categoryId || null,
    );
    return row;
  }

  addTransaction(tenantId, student, payload) {
    this.db.exec("BEGIN");
    try {
      const transaction = this.insertTransaction(tenantId, student.id, payload);
      const payment =
        payload.type === "payment"
          ? this.insertPayment(tenantId, student, {
	            amount: payload.amount,
	            type: legacyPaymentType(payload.method),
	            idempotencyKey: payload.idempotencyKey,
	            branchId: payload.branchId,
	            accountId: payload.accountId,
	            categoryId: payload.categoryId,
	          })
          : null;
      const balance = this.syncStudentBalance(tenantId, student.id);
      this.db.exec("COMMIT");
      return { transaction, payment, balance };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  upsertPrimaryGuardian(tenantId, studentId, payload) {
    const name = String(payload.parentName || "Guardian").trim() || "Guardian";
    const phone = String(payload.phone || "").trim();
    const normalized = normalizePhone(phone);
    const current = this.db.prepare(
      `SELECT g.* FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id AND g.tenant_id = sg.tenant_id
       WHERE sg.tenant_id = ? AND sg.student_id = ? AND sg.is_primary = 1 LIMIT 1`,
    ).get(tenantId, studentId);
    let guardian = current && (!normalized || current.phone_normalized === normalized) ? current : null;
    if (!guardian && normalized) {
      guardian = this.db.prepare(
        "SELECT * FROM guardians WHERE tenant_id = ? AND phone_normalized = ? AND lower(name) = lower(?) AND status = 'active' LIMIT 1",
      ).get(tenantId, normalized, name);
      if (!guardian) {
        const samePhone = this.db.prepare(
          "SELECT * FROM guardians WHERE tenant_id = ? AND phone_normalized = ? AND status = 'active' ORDER BY created_at LIMIT 2",
        ).all(tenantId, normalized);
        if (samePhone.length === 1) guardian = samePhone[0];
      }
    }
    const timestamp = now();
    if (!guardian) {
      guardian = { id: id(), telegram_chat_id: payload.telegramChatId || "" };
      this.db.prepare(
        `INSERT INTO guardians (id, tenant_id, name, phone, phone_normalized, email, telegram_chat_id, preferred_language, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      ).run(guardian.id, tenantId, name, phone, normalized, payload.parentEmail || "", payload.telegramChatId || "", payload.preferredLanguage || "uz", timestamp, timestamp);
    } else {
      this.db.prepare(
        `UPDATE guardians SET name = ?, phone = ?, phone_normalized = ?, email = ?,
         telegram_chat_id = CASE WHEN ? != '' THEN ? ELSE telegram_chat_id END, updated_at = ?
         WHERE tenant_id = ? AND id = ?`,
      ).run(name, phone, normalized, payload.parentEmail || guardian.email || "", payload.telegramChatId || "", payload.telegramChatId || "", timestamp, tenantId, guardian.id);
    }
    this.db.prepare("UPDATE student_guardians SET is_primary = 0 WHERE tenant_id = ? AND student_id = ?").run(tenantId, studentId);
    this.db.prepare(
      `INSERT INTO student_guardians
       (id, tenant_id, student_id, guardian_id, relationship, is_primary, is_emergency, receives_notifications, created_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, 1, ?)
       ON CONFLICT(tenant_id, student_id, guardian_id) DO UPDATE SET relationship = excluded.relationship, is_primary = 1`,
    ).run(id(), tenantId, studentId, guardian.id, payload.parentRelationship || "guardian", timestamp);
    const effectiveChatId = String(payload.telegramChatId || guardian.telegram_chat_id || "").trim();
    if (effectiveChatId) {
      this.db.prepare("UPDATE guardians SET telegram_chat_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
        .run(effectiveChatId, timestamp, tenantId, guardian.id);
      this.db.prepare(
        `UPDATE students SET telegram_chat_id = ?, updated_at = ?
         WHERE tenant_id = ? AND id IN (
           SELECT student_id FROM student_guardians WHERE tenant_id = ? AND guardian_id = ?
         )`,
      ).run(effectiveChatId, timestamp, tenantId, tenantId, guardian.id);
    }
    return guardian;
  }

  closeStudentEnrollment(tenantId, studentId, status, reason, actorUserId) {
    this.db.prepare(
      `UPDATE student_group_enrollments
       SET status = ?, end_date = ?, reason = COALESCE(NULLIF(?, ''), reason), ended_by = NULLIF(?, ''), ended_at = ?
       WHERE tenant_id = ? AND student_id = ? AND status = 'active'`,
    ).run(status, today(), reason || "", actorUserId || "", now(), tenantId, studentId);
  }

  openStudentEnrollment(tenantId, studentId, groupId, startDate, reason, actorUserId) {
    this.db.prepare(
      `INSERT INTO student_group_enrollments
       (id, tenant_id, student_id, group_id, status, start_date, end_date, reason, created_by, created_at)
       VALUES (?, ?, ?, ?, 'active', ?, NULL, ?, ?, ?)`,
    ).run(id(), tenantId, studentId, groupId, startDate || today(), reason || "", actorUserId || "", now());
  }

  assertGroupCanEnroll(tenantId, groupId, enrollmentDate = today(), excludeStudentId = "") {
    const group = this.db
      .prepare("SELECT id, status, active, capacity FROM groups WHERE tenant_id = ? AND id = ? LIMIT 1")
      .get(tenantId, groupId);
    if (!group) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }
    if ((group.status || (group.active ? "active" : "archived")) !== "active") {
      const error = new Error("Group is not active");
      error.status = 409;
      throw error;
    }
    const capacity = Number(group.capacity || 0);
    if (!capacity) return;
    const members = this.db
      .prepare(
        `SELECT COUNT(DISTINCT enrollment.student_id) AS count
         FROM student_group_enrollments enrollment
         JOIN students student
           ON student.id = enrollment.student_id AND student.tenant_id = enrollment.tenant_id
         WHERE enrollment.tenant_id = ? AND enrollment.group_id = ?
           AND enrollment.status = 'active'
           AND enrollment.start_date <= ?
           AND (enrollment.end_date IS NULL OR enrollment.end_date = '' OR enrollment.end_date >= ?)
           AND student.status != 'left'
           AND (? = '' OR enrollment.student_id != ?)`,
      )
      .get(tenantId, groupId, enrollmentDate || today(), enrollmentDate || today(), excludeStudentId || "", excludeStudentId || "");
    if (Number(members?.count || 0) >= capacity) {
      const error = new Error("Group capacity reached");
      error.status = 409;
      error.details = { groupId, capacity, activeMembers: Number(members?.count || 0) };
      throw error;
    }
  }

  createStudent(tenantId, payload) {
    const row = { id: id(), tenantId, ...payload };
    const branchId = payload.branchId || this.mainBranch(tenantId)?.id || null;
    const timestamp = now();
    const enrollmentDate = payload.enrollmentDate || today();
    this.db.exec("BEGIN");
    try {
      if ((row.status || "active") !== "left") {
        this.assertGroupCanEnroll(tenantId, row.groupId, enrollmentDate, row.id);
      }
      this.db.prepare(
        `INSERT INTO students
         (id, tenant_id, branch_id, name, group_id, parent_name, phone, phone_normalized, student_phone, email, birth_date, gender, address, source, enrollment_date, note, telegram_chat_id, debt, balance, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      ).run(row.id, tenantId, branchId, row.name, row.groupId, row.parentName, row.phone || "", normalizePhone(row.phone), row.studentPhone || "", row.email || "", row.birthDate || null, row.gender || "", row.address || "", row.source || "", enrollmentDate, row.note || "", row.telegramChatId || "", row.debt || 0, row.status || "active", timestamp, timestamp);
      this.upsertPrimaryGuardian(tenantId, row.id, row);
      this.openStudentEnrollment(tenantId, row.id, row.groupId, enrollmentDate, "Initial enrollment", payload.actorUserId);
      if ((row.status || "active") === "left") {
        this.closeStudentEnrollment(tenantId, row.id, "withdrawn", row.archiveReason || "Created as archived", payload.actorUserId);
        this.db.prepare("UPDATE students SET archived_at = ?, archive_reason = ? WHERE tenant_id = ? AND id = ?")
          .run(timestamp, row.archiveReason || "", tenantId, row.id);
      }
      if (Number(row.debt || 0) > 0) {
        this.insertTransaction(tenantId, row.id, {
          type: "charge",
          amount: Number(row.debt),
          description: "Boshlang'ich qarz",
          branchId,
        });
      }
      row.balance = this.syncStudentBalance(tenantId, row.id);
      row.debt = row.balance < 0 ? Math.round(Math.abs(row.balance)) : 0;
      row.status = row.status || "active";
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.student(tenantId, row.id);
  }

  updateStudent(tenantId, studentId, payload) {
    const existing = this.student(tenantId, studentId);
    if (!existing) return null;
    const nextStatus = payload.status || existing.status || "active";
    this.db.exec("BEGIN");
    try {
      const opensMembership = nextStatus !== "left"
        && (existing.groupId !== payload.groupId || existing.status === "left");
      if (opensMembership) {
        this.assertGroupCanEnroll(tenantId, payload.groupId, today(), studentId);
      }
      this.db.prepare(
        `UPDATE students SET name = ?, group_id = ?, parent_name = ?, phone = ?, phone_normalized = ?, student_phone = ?, email = ?,
         birth_date = ?, gender = ?, address = ?, source = ?, enrollment_date = ?, note = ?, status = ?,
         archived_at = CASE WHEN ? = 'left' THEN COALESCE(archived_at, ?) WHEN ? != 'left' THEN NULL ELSE archived_at END,
         archive_reason = CASE WHEN ? = 'left' THEN ? WHEN ? != 'left' THEN NULL ELSE archive_reason END, updated_at = ?
         WHERE tenant_id = ? AND id = ?`,
      ).run(payload.name, payload.groupId, payload.parentName, payload.phone || "", normalizePhone(payload.phone), payload.studentPhone || "", payload.email || "", payload.birthDate || null, payload.gender || "", payload.address || "", payload.source || "", payload.enrollmentDate || existing.enrollmentDate || today(), payload.note || "", nextStatus, nextStatus, now(), nextStatus, nextStatus, payload.archiveReason || "", nextStatus, now(), tenantId, studentId);
      if (existing.groupId !== payload.groupId) {
        this.closeStudentEnrollment(tenantId, studentId, "transferred", payload.transferReason || "Group changed", payload.actorUserId);
        if (nextStatus !== "left") this.openStudentEnrollment(tenantId, studentId, payload.groupId, today(), payload.transferReason || "Group transfer", payload.actorUserId);
      } else if (existing.status !== "left" && nextStatus === "left") {
        this.closeStudentEnrollment(tenantId, studentId, "withdrawn", payload.archiveReason || "Student archived", payload.actorUserId);
      } else if (existing.status === "left" && nextStatus !== "left") {
        const active = this.db.prepare("SELECT id FROM student_group_enrollments WHERE tenant_id = ? AND student_id = ? AND status = 'active'").get(tenantId, studentId);
        if (!active) this.openStudentEnrollment(tenantId, studentId, payload.groupId, today(), "Student restored", payload.actorUserId);
      }
      this.upsertPrimaryGuardian(tenantId, studentId, payload);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.student(tenantId, studentId);
  }

  deleteStudent(tenantId, studentId, payload = {}) {
    const student = this.student(tenantId, studentId);
    if (!student) return null;
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE students SET status = 'left', archived_at = ?, archive_reason = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
        .run(now(), payload.reason || "", now(), tenantId, studentId);
      this.closeStudentEnrollment(tenantId, studentId, "withdrawn", payload.reason || "Student archived", payload.actorUserId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.student(tenantId, studentId);
  }

  restoreStudent(tenantId, studentId, actorUserId) {
    const student = this.student(tenantId, studentId);
    if (!student) return null;
    this.db.exec("BEGIN");
    try {
      this.assertGroupCanEnroll(tenantId, student.groupId, today(), studentId);
      this.db.prepare("UPDATE students SET status = 'active', archived_at = NULL, archive_reason = NULL, updated_at = ? WHERE tenant_id = ? AND id = ?")
        .run(now(), tenantId, studentId);
      const active = this.db.prepare("SELECT id FROM student_group_enrollments WHERE tenant_id = ? AND student_id = ? AND status = 'active'").get(tenantId, studentId);
      if (!active) this.openStudentEnrollment(tenantId, studentId, student.groupId, today(), "Student restored", actorUserId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.student(tenantId, studentId);
  }

  createGroup(tenantId, payload) {
    const groupId = id();
    const branchId = payload.branchId || this.mainBranch(tenantId)?.id || null;
    const status = payload.status || "active";
    const timestamp = now();
    const startDate = payload.startDate || today();
    this.db.exec("BEGIN");
    try {
      this.db.prepare(
        `INSERT INTO groups
         (id, tenant_id, branch_id, name, subject, teacher_id, room, monthly_fee, active,
          description, level, capacity, start_date, end_date, status, color, note,
          archived_at, archive_reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        groupId,
        tenantId,
        branchId,
        payload.name,
        payload.subject,
        payload.teacherId,
        payload.room || "",
        Number(payload.monthlyFee || 0),
        status === "active" ? 1 : 0,
        payload.description || "",
        payload.level || "",
        Number(payload.capacity || 0),
        startDate,
        payload.endDate || null,
        status,
        payload.color || "",
        payload.note || "",
        status === "archived" ? timestamp : null,
        status === "archived" ? payload.archiveReason || "" : null,
        timestamp,
        timestamp,
      );
      this.db.prepare(
        `INSERT INTO group_teacher_assignments
         (id, tenant_id, group_id, teacher_id, status, valid_from, valid_until, created_by, created_at)
         VALUES (?, ?, ?, ?, 'active', ?, NULL, ?, ?)`,
      ).run(id(), tenantId, groupId, payload.teacherId, startDate, payload.actorUserId || "", timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.group(tenantId, groupId);
  }

  updateGroup(tenantId, groupId, payload) {
    const existing = this.group(tenantId, groupId);
    if (!existing) return null;
    const teacherId = payload.teacherId || existing.teacherId;
    const status = payload.status || existing.status || "active";
    const timestamp = now();
    const currentDate = today();
    const capacity = payload.capacity === undefined ? existing.capacity : Number(payload.capacity || 0);
    if (capacity > 0 && capacity < existing.studentsCount) {
      const error = new Error(`Group capacity cannot be lower than its ${existing.studentsCount} active members`);
      error.status = 409;
      throw error;
    }
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `UPDATE groups
           SET name = ?, subject = ?, description = ?, level = ?, teacher_id = ?, room = ?,
               capacity = ?, monthly_fee = ?, start_date = ?, end_date = ?, status = ?, active = ?,
               color = ?, note = ?,
               archived_at = CASE WHEN ? = 'archived' THEN COALESCE(archived_at, ?) ELSE NULL END,
               archive_reason = CASE WHEN ? = 'archived' THEN COALESCE(NULLIF(?, ''), archive_reason, '') ELSE NULL END,
               updated_at = ?
           WHERE tenant_id = ? AND id = ?`,
        )
        .run(
          payload.name === undefined ? existing.name : payload.name,
          payload.subject === undefined ? existing.subject : payload.subject,
          payload.description === undefined ? existing.description : payload.description || "",
          payload.level === undefined ? existing.level : payload.level || "",
          teacherId,
          payload.room === undefined ? existing.room : payload.room || "",
          capacity,
          payload.monthlyFee === undefined ? existing.monthlyFee : Number(payload.monthlyFee || 0),
          payload.startDate === undefined ? existing.startDate || null : payload.startDate || null,
          payload.endDate === undefined ? existing.endDate || null : payload.endDate || null,
          status,
          status === "active" ? 1 : 0,
          payload.color === undefined ? existing.color : payload.color || "",
          payload.note === undefined ? existing.note : payload.note || "",
          status,
          timestamp,
          status,
          payload.archiveReason || "",
          timestamp,
          tenantId,
          groupId,
        );

      if (teacherId !== existing.teacherId) {
        this.db.prepare(
          `UPDATE group_teacher_assignments
           SET status = 'ended', valid_until = ?, ended_by = NULLIF(?, ''), ended_at = ?
           WHERE tenant_id = ? AND group_id = ? AND status = 'active'`,
        ).run(currentDate, payload.actorUserId || "", timestamp, tenantId, groupId);
        this.db.prepare(
          `INSERT INTO group_teacher_assignments
           (id, tenant_id, group_id, teacher_id, status, valid_from, valid_until, created_by, created_at)
           VALUES (?, ?, ?, ?, 'active', ?, NULL, ?, ?)`,
        ).run(id(), tenantId, groupId, teacherId, currentDate, payload.actorUserId || "", timestamp);
        this.db.prepare(
          `UPDATE lessons SET teacher_id = ?
           WHERE tenant_id = ? AND group_id = ? AND date >= ?
             AND status NOT IN ('completed', 'cancelled')
             AND (teacher_id IS NULL OR teacher_id = ?)`,
        ).run(teacherId, tenantId, groupId, currentDate, existing.teacherId);
      } else {
        const currentAssignment = this.db.prepare(
          "SELECT id FROM group_teacher_assignments WHERE tenant_id = ? AND group_id = ? AND status = 'active' LIMIT 1",
        ).get(tenantId, groupId);
        if (!currentAssignment) {
          this.db.prepare(
            `INSERT INTO group_teacher_assignments
             (id, tenant_id, group_id, teacher_id, status, valid_from, valid_until, created_by, created_at)
             VALUES (?, ?, ?, ?, 'active', ?, NULL, ?, ?)`,
          ).run(id(), tenantId, groupId, teacherId, existing.startDate || currentDate, payload.actorUserId || "", timestamp);
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.group(tenantId, groupId);
  }

  groupArchiveBlockers(tenantId, groupId) {
    const currentDate = today();
    const activeMembers = this.db.prepare(
      `SELECT COUNT(DISTINCT enrollment.student_id) AS count
       FROM student_group_enrollments enrollment
       JOIN students student ON student.id = enrollment.student_id AND student.tenant_id = enrollment.tenant_id
       WHERE enrollment.tenant_id = ? AND enrollment.group_id = ? AND enrollment.status = 'active'
         AND enrollment.start_date <= ?
         AND (enrollment.end_date IS NULL OR enrollment.end_date = '' OR enrollment.end_date >= ?)
         AND student.status != 'left'`,
    ).get(tenantId, groupId, currentDate, currentDate).count;
    const upcomingLessons = this.db.prepare(
      `SELECT COUNT(*) AS count FROM lessons
       WHERE tenant_id = ? AND group_id = ? AND date >= ? AND status IN ('waiting', 'planned')`,
    ).get(tenantId, groupId, currentDate).count;
    const activeSchedules = this.db.prepare(
      `SELECT COUNT(*) AS count FROM schedules
       WHERE tenant_id = ? AND group_id = ? AND status = 'active' AND is_recurring = 1
         AND (valid_until IS NULL OR valid_until = '' OR valid_until >= ?)`,
    ).get(tenantId, groupId, currentDate).count;
    return {
      activeMembers: Number(activeMembers || 0),
      futureLessons: Number(upcomingLessons || 0),
      upcomingLessons: Number(upcomingLessons || 0),
      activeSchedules: Number(activeSchedules || 0),
    };
  }

  archiveGroup(tenantId, groupId, payload = {}) {
    const existing = this.group(tenantId, groupId);
    if (!existing) return null;
    const timestamp = now();
    this.db.prepare(
      `UPDATE groups
       SET status = 'archived', active = 0, archived_at = ?, archive_reason = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ?`,
    ).run(timestamp, payload.reason || "", timestamp, tenantId, groupId);
    return this.group(tenantId, groupId);
  }

  restoreGroup(tenantId, groupId, actorUserId = "") {
    const existing = this.group(tenantId, groupId);
    if (!existing) return null;
    const timestamp = now();
    this.db.prepare(
      `UPDATE groups
       SET status = 'active', active = 1, archived_at = NULL, archive_reason = NULL, updated_at = ?
       WHERE tenant_id = ? AND id = ?`,
    ).run(timestamp, tenantId, groupId);
    void actorUserId;
    return this.group(tenantId, groupId);
  }

  groupUsage(tenantId, groupId) {
    const currentStudents = this.db
      .prepare("SELECT COUNT(*) AS count FROM students WHERE tenant_id = ? AND group_id = ?")
      .get(tenantId, groupId).count;
    const enrollments = this.db
      .prepare("SELECT COUNT(*) AS count FROM student_group_enrollments WHERE tenant_id = ? AND group_id = ?")
      .get(tenantId, groupId).count;
    const associatedStudents = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM (
           SELECT id AS student_id FROM students WHERE tenant_id = ? AND group_id = ?
           UNION
           SELECT student_id FROM student_group_enrollments WHERE tenant_id = ? AND group_id = ?
         )`,
      )
      .get(tenantId, groupId, tenantId, groupId).count;
    return {
      // Keep `students` dependency-aware because existing callers use it as the
      // delete guard. Historical enrollments also RESTRICT group deletion.
      students: associatedStudents,
      currentStudents,
      enrollments,
      lessons: this.db.prepare("SELECT COUNT(*) AS count FROM lessons WHERE tenant_id = ? AND group_id = ?").get(tenantId, groupId).count,
      schedules: this.db.prepare("SELECT COUNT(*) AS count FROM schedules WHERE tenant_id = ? AND group_id = ?").get(tenantId, groupId).count,
    };
  }

  deleteGroup(tenantId, groupId) {
    // Backwards-compatible safety: group deletion is now always a soft archive.
    return this.archiveGroup(tenantId, groupId, { reason: "Legacy delete request" });
  }

  teacherAvailability(tenantId, teacherId, weekday, startTime, endTime) {
    const configured = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM teacher_working_hours
         WHERE tenant_id = ? AND teacher_id = ? AND weekday = ?`,
      )
      .get(tenantId, teacherId, String(weekday));
    if (!Number(configured?.count || 0)) return { configured: false, available: true };
    const interval = this.db
      .prepare(
        `SELECT id, start_time, end_time
         FROM teacher_working_hours
         WHERE tenant_id = ? AND teacher_id = ? AND weekday = ?
           AND start_time <= ? AND end_time >= ?
         ORDER BY start_time
         LIMIT 1`,
      )
      .get(tenantId, teacherId, String(weekday), startTime, endTime);
    return {
      configured: true,
      available: Boolean(interval),
      interval: interval ? { id: interval.id, startTime: interval.start_time, endTime: interval.end_time } : null,
    };
  }

  studentIdsForGroupOnDate(tenantId, groupId, date) {
    return new Set(
      this.db
        .prepare(
          `SELECT DISTINCT enrollment.student_id
           FROM student_group_enrollments enrollment
           JOIN students student
             ON student.id = enrollment.student_id AND student.tenant_id = enrollment.tenant_id
           WHERE enrollment.tenant_id = ? AND enrollment.group_id = ?
             AND enrollment.start_date <= ?
             AND (enrollment.end_date IS NULL OR enrollment.end_date = '' OR ? < enrollment.end_date)
             AND student.status != 'left'`,
        )
        .all(tenantId, groupId, date, date)
        .map((row) => row.student_id),
    );
  }

  lessonConflicts(tenantId, payload, excludeLessonId = null, excludeScheduleId = null) {
    const ownStudents = this.studentIdsForGroupOnDate(tenantId, payload.groupId, payload.date);
    const roomName = String(payload.roomName || "").trim().toLocaleLowerCase();
    const kindsFor = (candidate) => {
      const conflicts = [];
      if (candidate.group_id === payload.groupId) conflicts.push("group");
      if (payload.teacherId && candidate.teacher_id === payload.teacherId) conflicts.push("teacher");
      const candidateRoomName = String(candidate.room_name || "").trim().toLocaleLowerCase();
      if (
        (payload.roomId && candidate.room_id && candidate.room_id === payload.roomId) ||
        (roomName && candidateRoomName && candidateRoomName === roomName)
      ) {
        conflicts.push("room");
      }
      if (candidate.group_id !== payload.groupId && ownStudents.size) {
        const otherStudents = this.studentIdsForGroupOnDate(tenantId, candidate.group_id, payload.date);
        if ([...ownStudents].some((studentId) => otherStudents.has(studentId))) conflicts.push("student");
      }
      return [...new Set(conflicts)];
    };

    const concreteRows = this.db
      .prepare(
        `SELECT lesson.id, lesson.group_id, group_row.name AS group_name,
                COALESCE(lesson.teacher_id, schedule.teacher_id, group_row.teacher_id) AS teacher_id,
                teacher.name AS teacher_name,
                COALESCE(lesson.room_id, schedule.room_id) AS room_id,
                COALESCE(NULLIF(lesson.room_name, ''), room.name, group_row.room, '') AS room_name,
                COALESCE(NULLIF(lesson.start_time, ''), schedule.start_time) AS start_time,
                COALESCE(NULLIF(lesson.end_time, ''), schedule.end_time) AS end_time
         FROM lessons lesson
         JOIN groups group_row
           ON group_row.id = lesson.group_id AND group_row.tenant_id = lesson.tenant_id
         LEFT JOIN schedules schedule
           ON schedule.id = lesson.schedule_id AND schedule.tenant_id = lesson.tenant_id
         LEFT JOIN teachers teacher
           ON teacher.id = COALESCE(lesson.teacher_id, schedule.teacher_id, group_row.teacher_id)
          AND teacher.tenant_id = lesson.tenant_id
         LEFT JOIN rooms room
           ON room.id = COALESCE(lesson.room_id, schedule.room_id) AND room.tenant_id = lesson.tenant_id
         WHERE lesson.tenant_id = ? AND lesson.date = ? AND lesson.status != 'cancelled'
           AND COALESCE(NULLIF(lesson.start_time, ''), schedule.start_time) < ?
           AND COALESCE(NULLIF(lesson.end_time, ''), schedule.end_time) > ?
           AND (? IS NULL OR lesson.id != ?)
         ORDER BY start_time, lesson.id`,
      )
      .all(tenantId, payload.date, payload.endTime, payload.startTime, excludeLessonId, excludeLessonId);

    const weekday = isoWeekday(payload.date);
    const occurrenceKey = payload.occurrenceKey || isoWeekKey(payload.date);
    const scheduleRows = this.db
      .prepare(
        `SELECT schedule.id, schedule.group_id, group_row.name AS group_name,
                COALESCE(schedule.teacher_id, group_row.teacher_id) AS teacher_id,
                teacher.name AS teacher_name,
                schedule.room_id,
                COALESCE(room.name, group_row.room, '') AS room_name,
                schedule.start_time, schedule.end_time
         FROM schedules schedule
         JOIN groups group_row
           ON group_row.id = schedule.group_id AND group_row.tenant_id = schedule.tenant_id
         LEFT JOIN teachers teacher
           ON teacher.id = COALESCE(schedule.teacher_id, group_row.teacher_id)
          AND teacher.tenant_id = schedule.tenant_id
         LEFT JOIN rooms room
           ON room.id = schedule.room_id AND room.tenant_id = schedule.tenant_id
         WHERE schedule.tenant_id = ? AND schedule.is_recurring = 1
           AND schedule.status = 'active' AND group_row.status = 'active'
           AND schedule.weekday = ? AND schedule.start_time < ? AND schedule.end_time > ?
           AND COALESCE(NULLIF(schedule.valid_from, ''), group_row.start_date, '0001-01-01') <= ?
           AND (schedule.valid_until IS NULL OR schedule.valid_until = '' OR schedule.valid_until >= ?)
           AND (group_row.start_date IS NULL OR group_row.start_date = '' OR group_row.start_date <= ?)
           AND (group_row.end_date IS NULL OR group_row.end_date = '' OR group_row.end_date >= ?)
           AND (? IS NULL OR schedule.id != ?)
           AND NOT EXISTS (
             SELECT 1 FROM lessons occurrence
             WHERE occurrence.tenant_id = schedule.tenant_id
               AND (
                 (schedule.series_id IS NOT NULL AND schedule.series_id != ''
                  AND occurrence.schedule_series_id = schedule.series_id
                  AND occurrence.occurrence_key = ?)
                 OR
                 (occurrence.schedule_id = schedule.id
                  AND COALESCE(occurrence.occurrence_date, occurrence.date) = ?)
               )
           )
         ORDER BY schedule.start_time, schedule.id`,
      )
      .all(
        tenantId,
        String(weekday),
        payload.endTime,
        payload.startTime,
        payload.date,
        payload.date,
        payload.date,
        payload.date,
        excludeScheduleId,
        excludeScheduleId,
        occurrenceKey,
        payload.date,
      );

    return [
      ...concreteRows.map((row) => ({ ...row, source: "lesson", conflicts: kindsFor(row) })),
      ...scheduleRows.map((row) => ({ ...row, source: "schedule", conflicts: kindsFor(row) })),
    ]
      .filter((row) => row.conflicts.length)
      .map((row) => ({
        id: row.id,
        source: row.source,
        groupId: row.group_id,
        groupName: row.group_name || "",
        teacherId: row.teacher_id || "",
        teacherName: row.teacher_name || "",
        roomId: row.room_id || "",
        roomName: row.room_name || "",
        startTime: row.start_time,
        endTime: row.end_time,
        conflicts: row.conflicts,
      }));
  }

  insertLessonEvent(tenantId, lessonId, actor, action, reason = "", before = null, after = null) {
    this.db
      .prepare(
        `INSERT INTO lesson_events
         (id, tenant_id, lesson_id, actor_user_id, actor_role, action, reason, before_json, after_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id(),
        tenantId,
        lessonId,
        actor?.userId || "system",
        actor?.role || "system",
        action,
        reason || "",
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        now(),
      );
  }

  createLesson(tenantId, payload) {
    const row = {
      id: id(),
      tenantId,
      ...payload,
      date: payload.date || today(),
      status: payload.status || "planned",
    };
    const timestamp = now();
    this.db.exec("BEGIN");
    try {
      const duplicate = this.db
        .prepare(
          `SELECT id FROM lessons
           WHERE tenant_id = ? AND group_id = ? AND date = ?
             AND COALESCE(NULLIF(start_time, ''), ?) = ?
             AND COALESCE(NULLIF(end_time, ''), ?) = ?
           LIMIT 1`,
        )
        .get(tenantId, row.groupId, row.date, row.startTime, row.startTime, row.endTime, row.endTime);
      if (duplicate) {
        const error = new Error("Lesson already exists");
        error.status = 409;
        throw error;
      }
      const branchId = row.branchId || this.mainBranch(tenantId)?.id || null;
      this.db
        .prepare(
          `INSERT INTO lessons
           (id, tenant_id, branch_id, group_id, teacher_id, schedule_id, date, time,
            start_time, end_time, occurrence_date, status, lesson_type, is_trial,
            room_id, room_name, topic, homework, note, created_by, created_at, updated_by, updated_at,
            schedule_series_id, occurrence_key, override_mask, base_schedule_id, base_schedule_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.id,
          tenantId,
          branchId,
          row.groupId,
          row.teacherId || null,
          row.scheduleId || null,
          row.date,
          `${row.startTime} - ${row.endTime}`,
          row.startTime,
          row.endTime,
          row.occurrenceDate || null,
          row.status,
          row.lessonType || "group",
          row.isTrial ? 1 : 0,
          row.roomId || null,
          row.roomName || "",
          row.topic || "",
          row.homework || "",
          row.note || "",
          row.actorUserId || "system",
          timestamp,
          row.actorUserId || "system",
          timestamp,
          row.scheduleSeriesId || null,
          row.occurrenceKey || null,
          Number(row.overrideMask || 0),
          row.baseScheduleId || row.scheduleId || null,
          row.baseScheduleVersion || null,
        );
      const created = this.lesson(tenantId, row.id);
      this.insertLessonEvent(tenantId, row.id, { userId: row.actorUserId, role: row.actorRole }, "created", "", null, lessonStateSnapshot(created));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) error.status = 409;
      throw error;
    }
    return this.lesson(tenantId, row.id);
  }

  lesson(tenantId, lessonId) {
    const row = this.db
      .prepare(
        `SELECT l.*, g.name AS group_name, g.subject, g.room,
                COALESCE(l.teacher_id, schedule.teacher_id, g.teacher_id) AS effective_teacher_id,
                COALESCE(l.room_id, schedule.room_id) AS effective_room_id,
                COALESCE(NULLIF(l.room_name, ''), room.name, g.room, '') AS effective_room_name,
                t.name AS teacher_name
         FROM lessons l
         JOIN groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
         LEFT JOIN schedules schedule ON schedule.id = l.schedule_id AND schedule.tenant_id = l.tenant_id
         LEFT JOIN teachers t ON t.id = COALESCE(l.teacher_id, schedule.teacher_id, g.teacher_id) AND t.tenant_id = g.tenant_id
         LEFT JOIN rooms room ON room.id = COALESCE(l.room_id, schedule.room_id) AND room.tenant_id = l.tenant_id
         WHERE l.tenant_id = ? AND l.id = ?
         LIMIT 1`,
      )
      .get(tenantId, lessonId);
    return row ? camelLesson(row) : null;
  }

  lessonProfile(tenantId, lessonId) {
    const lesson = this.lesson(tenantId, lessonId);
    if (!lesson) return null;
    const events = this.db
      .prepare(
        `SELECT id, actor_user_id, actor_role, action, reason, before_json, after_json, created_at
         FROM lesson_events
         WHERE tenant_id = ? AND lesson_id = ?
         ORDER BY created_at, id`,
      )
      .all(tenantId, lessonId)
      .map((event) => ({
        id: event.id,
        actorUserId: event.actor_user_id || "",
        actorRole: event.actor_role || "",
        action: event.action,
        reason: event.reason || "",
        before: parseJson(event.before_json, null),
        after: parseJson(event.after_json, null),
        createdAt: event.created_at,
      }));
    const attendanceRevisions = this.db
      .prepare(
        `SELECT id, revision_no, actor_user_id, actor_role, reason, snapshot_json, created_at
         FROM lesson_attendance_revisions
         WHERE tenant_id = ? AND lesson_id = ?
         ORDER BY revision_no`,
      )
      .all(tenantId, lessonId)
      .map((revision) => ({
        id: revision.id,
        revisionNo: Number(revision.revision_no),
        actorUserId: revision.actor_user_id || "",
        actorRole: revision.actor_role || "",
        reason: revision.reason || "",
        records: parseJson(revision.snapshot_json, []),
        createdAt: revision.created_at,
      }));
    const settlement = this.activeLessonSettlement(tenantId, lessonId);
    return { lesson, events, attendanceRevisions, settlement };
  }

  financialRunByKey(tenantId, key) {
    const row = this.db
      .prepare("SELECT * FROM lesson_financial_runs WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1")
      .get(tenantId, key);
    return row ? camelFinancialRun(row) : null;
  }

  lessonSettlement(tenantId, settlementId) {
    const row = this.db
      .prepare("SELECT * FROM lesson_financial_settlements WHERE tenant_id = ? AND id = ?")
      .get(tenantId, settlementId);
    return row ? camelSettlement(row) : null;
  }

  activeLessonSettlement(tenantId, lessonId) {
    const row = this.db
      .prepare(
        `SELECT * FROM lesson_financial_settlements
         WHERE tenant_id = ? AND lesson_id = ? AND status = 'confirmed'
         ORDER BY confirmed_at DESC LIMIT 1`,
      )
      .get(tenantId, lessonId);
    return row ? camelSettlement(row) : null;
  }

  latestLessonSettlement(tenantId, lessonId) {
    const row = this.db
      .prepare(
        `SELECT * FROM lesson_financial_settlements
         WHERE tenant_id = ? AND lesson_id = ?
         ORDER BY confirmed_at DESC, id DESC LIMIT 1`,
      )
      .get(tenantId, lessonId);
    return row ? camelSettlement(row) : null;
  }

  resolveLessonBillingPolicy(tenantId, lesson) {
    const rows = this.db
      .prepare(
        `SELECT policy.*,
                (CASE WHEN policy.group_id = ? THEN 2 ELSE 0 END
                 + CASE WHEN policy.branch_id = ? THEN 1 ELSE 0 END) AS specificity
         FROM lesson_billing_policies policy
         WHERE policy.tenant_id = ? AND policy.status = 'active'
           AND policy.valid_from <= ?
           AND (policy.valid_until IS NULL OR policy.valid_until = '' OR policy.valid_until >= ?)
           AND (policy.group_id IS NULL OR policy.group_id = '' OR policy.group_id = ?)
           AND (policy.branch_id IS NULL OR policy.branch_id = '' OR policy.branch_id = ?)
         ORDER BY specificity DESC, policy.version DESC, policy.created_at DESC`,
      )
      .all(
        lesson.groupId,
        lesson.branchId || "",
        tenantId,
        lesson.date,
        lesson.date,
        lesson.groupId,
        lesson.branchId || "",
      );
    if (!rows.length) return { policy: null, ambiguous: false, candidates: [] };
    const topSpecificity = Number(rows[0].specificity || 0);
    const top = rows.filter((row) => Number(row.specificity || 0) === topSpecificity);
    return {
      policy: top.length === 1 ? camelLessonBillingPolicy(top[0]) : null,
      ambiguous: top.length > 1,
      candidates: top.map(camelLessonBillingPolicy),
    };
  }

  resolveTeacherRateRule(tenantId, lesson) {
    const rows = this.db
      .prepare(
        `SELECT rule.*, teacher.name AS teacher_name,
                (CASE WHEN rule.group_id = ? THEN 2 ELSE 0 END
                 + CASE WHEN rule.lesson_type = ? THEN 1 ELSE 0 END) AS specificity
         FROM teacher_rate_rules rule
         JOIN teachers teacher
           ON teacher.id = rule.teacher_id AND teacher.tenant_id = rule.tenant_id
         WHERE rule.tenant_id = ? AND rule.teacher_id = ? AND rule.status = 'active'
           AND rule.effective_from <= ?
           AND (rule.effective_until IS NULL OR rule.effective_until = '' OR rule.effective_until >= ?)
           AND (rule.group_id IS NULL OR rule.group_id = '' OR rule.group_id = ?)
           AND (rule.lesson_type IS NULL OR rule.lesson_type = '' OR rule.lesson_type = ?)
         ORDER BY specificity DESC, rule.version DESC, rule.created_at DESC`,
      )
      .all(
        lesson.groupId,
        lesson.lessonType || "group",
        tenantId,
        lesson.teacherId,
        lesson.date,
        lesson.date,
        lesson.groupId,
        lesson.lessonType || "group",
      );
    if (!rows.length) return { rateRule: null, ambiguous: false, candidates: [] };
    const topSpecificity = Number(rows[0].specificity || 0);
    const top = rows.filter((row) => Number(row.specificity || 0) === topSpecificity);
    return {
      rateRule: top.length === 1 ? camelTeacherRateRule(top[0]) : null,
      ambiguous: top.length > 1,
      candidates: top.map(camelTeacherRateRule),
    };
  }

  lessonFinancialPreview(tenantId, lessonId) {
    const lesson = this.lesson(tenantId, lessonId);
    if (!lesson) return null;
    const attendance = this.attendanceForLesson(tenantId, lessonId);
    const blockers = [];
    const policyResolution = this.resolveLessonBillingPolicy(tenantId, lesson);
    const rateResolution = lesson.teacherId
      ? this.resolveTeacherRateRule(tenantId, lesson)
      : { rateRule: null, ambiguous: false, candidates: [] };
    if (lesson.financialStatus === "legacy") {
      blockers.push({ code: "legacy_lesson", message: "Legacy lessons are never posted automatically; create a new attendance revision to opt in" });
    }
    if (lesson.financialStatus === "posted" || this.activeLessonSettlement(tenantId, lessonId)) {
      blockers.push({ code: "already_confirmed", message: "Lesson finance is already confirmed" });
    }
    if (lesson.financialStatus === "reversed") {
      blockers.push({ code: "new_revision_required", message: "A new attendance revision is required before reconfirmation" });
    }
    if (!attendance.length) blockers.push({ code: "attendance_missing", message: "Completed lesson has no attendance snapshot" });
    if (policyResolution.ambiguous) {
      blockers.push({ code: "billing_policy_ambiguous", message: "More than one equally specific billing policy applies" });
    } else if (!policyResolution.policy) {
      blockers.push({ code: "billing_policy_missing", message: "An effective lesson billing policy is required" });
    }
    if (rateResolution.ambiguous) {
      blockers.push({ code: "teacher_rate_ambiguous", message: "More than one equally specific teacher rate applies" });
    } else if (!rateResolution.rateRule) {
      blockers.push({ code: "teacher_rate_missing", message: "An effective teacher rate is required" });
    }
    const closedPeriod = this.closedFinancePeriod(tenantId, lesson.branchId || "", lesson.date);
    if (closedPeriod) blockers.push({ code: "finance_period_closed", message: `Finance period is closed: ${closedPeriod.label}` });

    const policy = policyResolution.policy;
    const studentLines = attendance.map((record) => ({
      studentId: record.studentId,
      studentName: record.studentName || "",
      attendanceStatus: record.status,
      reasonId: record.reasonId || "",
      reasonCode: record.reasonCode || "",
      reasonName: record.reasonName || "",
      chargePercent: Number(record.chargePercent || 0),
      consumePercent: Number(record.consumePercent || 0),
      baseAmount: Number(policy?.baseAmount || 0),
      chargeAmount: policy ? roundUzs(Number(policy.baseAmount) * Number(record.chargePercent || 0) / 100) : 0,
      currency: policy?.currency || "UZS",
    }));

    const rateRule = rateResolution.rateRule;
    const durationMinutes = lessonDurationMinutes(lesson);
    const attendedCount = attendance.filter((record) => ["present", "late"].includes(record.status)).length;
    let basisQuantity = 0;
    let accrualAmount = 0;
    if (rateRule) {
      if (rateRule.rateType === "flat") basisQuantity = 1;
      if (rateRule.rateType === "per_student") basisQuantity = attendedCount;
      if (rateRule.rateType === "hourly") basisQuantity = durationMinutes / 60;
      accrualAmount = roundUzs(rateRule.amount * basisQuantity);
    }
    const teacherAccrual = rateRule
      ? {
          teacherId: lesson.teacherId,
          teacherName: lesson.teacherName || "",
          rateRuleId: rateRule.id,
          rateRuleVersion: rateRule.version,
          rateType: rateRule.rateType,
          rateAmount: rateRule.amount,
          durationMinutes,
          basisQuantity,
          attendedCount,
          accrualAmount,
          currency: rateRule.currency,
        }
      : null;
    const activeSettlement = this.activeLessonSettlement(tenantId, lessonId);
    return {
      lesson,
      financialStatus: lesson.financialStatus,
      attendanceVersion: lesson.attendanceVersion,
      lessonVersion: lesson.version,
      billingPolicy: policy,
      studentLines,
      teacherAccrual,
      blockers,
      readyToConfirm: lesson.status === "completed" && lesson.financialStatus === "pending" && blockers.length === 0,
      totals: {
        studentCharges: studentLines.reduce((sum, line) => sum + line.chargeAmount, 0),
        teacherAccrual: teacherAccrual?.accrualAmount || 0,
      },
      settlement: activeSettlement || this.latestLessonSettlement(tenantId, lessonId),
    };
  }

  lessonFinanceResult(tenantId, lessonId, reused = false) {
    const preview = this.lessonFinancialPreview(tenantId, lessonId);
    const settlement = this.activeLessonSettlement(tenantId, lessonId) || this.latestLessonSettlement(tenantId, lessonId);
    const postings = settlement
      ? this.db
          .prepare(
            `SELECT posting.*, student.name AS student_name
             FROM lesson_student_postings posting
             JOIN students student
               ON student.id = posting.student_id AND student.tenant_id = posting.tenant_id
             WHERE posting.tenant_id = ? AND posting.settlement_id = ?
             ORDER BY student.name`,
          )
          .all(tenantId, settlement.id)
          .map((row) => ({
            id: row.id,
            studentId: row.student_id,
            studentName: row.student_name,
            attendanceStatus: row.attendance_status,
            reasonCode: row.reason_code || "",
            chargePercent: Number(row.charge_percent || 0),
            chargeAmount: Number(row.charge_amount || 0),
            currency: row.currency || "UZS",
            ledgerTransactionId: row.ledger_transaction_id || null,
            reversalTransactionId: row.reversal_transaction_id || null,
            status: row.status,
          }))
      : [];
    const accruals = settlement
      ? this.db
          .prepare(
            `SELECT * FROM teacher_accruals
             WHERE tenant_id = ? AND settlement_id = ?
             ORDER BY created_at, id`,
          )
          .all(tenantId, settlement.id)
          .map((row) => ({
            id: row.id,
            teacherId: row.teacher_id,
            entryType: row.entry_type,
            originalEntryId: row.original_entry_id || "",
            amount: Number(row.accrual_amount || 0),
            currency: row.currency || "UZS",
            createdAt: row.created_at,
          }))
      : [];
    return { ok: true, reused, lesson: this.lesson(tenantId, lessonId), settlement, postings, accruals, preview };
  }

  confirmLessonFinance(tenantId, lessonId, payload) {
    const beforeLesson = this.lesson(tenantId, lessonId);
    if (!beforeLesson) return null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existingRun = this.financialRunByKey(tenantId, payload.idempotencyKey);
      if (existingRun) {
        if (existingRun.lessonId !== lessonId || existingRun.operation !== "confirm" || existingRun.requestFingerprint !== payload.requestFingerprint) {
          const error = new Error("idempotencyKey was already used with a different financial request");
          error.status = 409;
          throw error;
        }
        this.db.exec("COMMIT");
        return this.lessonFinanceResult(tenantId, lessonId, true);
      }
      const lockedLesson = this.lesson(tenantId, lessonId);
      if (
        lockedLesson.status !== "completed"
        || lockedLesson.financialStatus !== "pending"
        || lockedLesson.attendanceVersion !== payload.attendanceVersion
        || lockedLesson.version !== payload.lessonVersion
      ) {
        const error = new Error("Lesson or attendance changed before financial confirmation");
        error.status = 409;
        throw error;
      }
      const preview = this.lessonFinancialPreview(tenantId, lessonId);
      if (!preview.readyToConfirm) {
        const error = new Error(preview.blockers.map((blocker) => blocker.message).join("; ") || "Lesson finance is not ready");
        error.status = 409;
        error.details = preview.blockers;
        throw error;
      }

      const timestamp = now();
      const nextFinancialVersion = Number(lockedLesson.financialVersion || 0) + 1;
      const runId = id();
      const settlementId = id();
      this.db
        .prepare(
          `INSERT INTO lesson_financial_runs
           (id, tenant_id, lesson_id, idempotency_key, request_fingerprint, financial_version,
            operation, status, result_json, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'confirm', 'pending', '{}', ?, ?)`,
        )
        .run(
          runId,
          tenantId,
          lessonId,
          payload.idempotencyKey,
          payload.requestFingerprint,
          nextFinancialVersion,
          payload.actorUserId || "system",
          timestamp,
        );
      this.db
        .prepare(
          `INSERT INTO lesson_financial_settlements
           (id, tenant_id, branch_id, lesson_id, attendance_revision_no, status,
            service_date, posting_date, currency, billing_policy_id, billing_policy_version,
            teacher_rate_rule_id, teacher_rate_rule_version, confirmed_by, confirmed_at,
            version, idempotency_key, request_fingerprint)
           VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          settlementId,
          tenantId,
          lockedLesson.branchId || null,
          lessonId,
          lockedLesson.attendanceVersion,
          lockedLesson.date,
          lockedLesson.date,
          preview.billingPolicy.currency || "UZS",
          preview.billingPolicy.id,
          preview.billingPolicy.version,
          preview.teacherAccrual.rateRuleId,
          preview.teacherAccrual.rateRuleVersion,
          payload.actorUserId || "system",
          timestamp,
          payload.idempotencyKey,
          payload.requestFingerprint,
        );

      const affectedStudents = new Set();
      const insertPosting = this.db.prepare(
        `INSERT INTO lesson_student_postings
         (id, tenant_id, settlement_id, lesson_id, student_id, financial_run_id, revision,
          attendance_status, reason_id, reason_code, reason_name, charge_percent, consume_percent,
          billing_policy_id, billing_policy_version, base_amount_snapshot, policy_snapshot_json,
          subscription_id, consume_units, unit_price, charge_amount, currency,
          ledger_transaction_id, status, idempotency_key, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      );
      preview.studentLines.forEach((line) => {
        let ledgerTransactionId = null;
        const postingKey = `lesson:${lessonId}:attendance:${lockedLesson.attendanceVersion}:student:${line.studentId}:charge`;
        if (line.chargeAmount > 0) {
          const transaction = this.insertTransaction(tenantId, line.studentId, {
            branchId: lockedLesson.branchId || "",
            type: "charge",
            effect: "debit",
            amount: line.chargeAmount,
            currency: line.currency,
            description: `${lockedLesson.date} ${lockedLesson.groupName} darsi`,
            invoiceDate: lockedLesson.date,
            idempotencyKey: postingKey,
            requestFingerprint: payload.requestFingerprint,
            sourceType: "lesson_settlement",
            sourceId: settlementId,
          });
          ledgerTransactionId = transaction.id;
          affectedStudents.add(line.studentId);
        }
        insertPosting.run(
          id(),
          tenantId,
          settlementId,
          lessonId,
          line.studentId,
          runId,
          lockedLesson.attendanceVersion,
          line.attendanceStatus,
          line.reasonId || null,
          line.reasonCode || "",
          line.reasonName || "",
          line.chargePercent,
          line.consumePercent,
          preview.billingPolicy.id,
          preview.billingPolicy.version,
          preview.billingPolicy.baseAmount,
          JSON.stringify({
            billingPolicyId: preview.billingPolicy.id,
            billingPolicyVersion: preview.billingPolicy.version,
            baseAmount: preview.billingPolicy.baseAmount,
            chargePercent: line.chargePercent,
            reasonCode: line.reasonCode,
          }),
          preview.billingPolicy.baseAmount,
          line.chargeAmount,
          line.currency,
          ledgerTransactionId,
          postingKey,
          payload.actorUserId || "system",
          timestamp,
        );
      });

      const accrual = preview.teacherAccrual;
      const accrualKey = `lesson:${lessonId}:attendance:${lockedLesson.attendanceVersion}:teacher:${accrual.teacherId}:accrual`;
      this.db
        .prepare(
          `INSERT INTO teacher_accruals
           (id, tenant_id, settlement_id, lesson_id, teacher_id, financial_run_id, rate_rule_id,
            revision, entry_type, original_entry_id, rate_type_snapshot, rate_amount_snapshot,
            duration_minutes_snapshot, basis_quantity_snapshot, basis_snapshot_json,
            accrual_amount, currency, idempotency_key, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accrual', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id(),
          tenantId,
          settlementId,
          lessonId,
          accrual.teacherId,
          runId,
          accrual.rateRuleId,
          lockedLesson.attendanceVersion,
          accrual.rateType,
          accrual.rateAmount,
          accrual.durationMinutes,
          accrual.basisQuantity,
          JSON.stringify({ attendedCount: accrual.attendedCount, durationMinutes: accrual.durationMinutes }),
          accrual.accrualAmount,
          accrual.currency,
          accrualKey,
          payload.actorUserId || "system",
          timestamp,
        );

      const update = this.db
        .prepare(
          `UPDATE lessons
           SET financial_status = 'posted', financial_version = ?, financial_posted_at = ?,
               financial_posted_by = ?, updated_by = ?, updated_at = ?, version = version + 1
           WHERE tenant_id = ? AND id = ? AND version = ? AND attendance_version = ?
             AND status = 'completed' AND financial_status = 'pending'`,
        )
        .run(
          nextFinancialVersion,
          timestamp,
          payload.actorUserId || "system",
          payload.actorUserId || "system",
          timestamp,
          tenantId,
          lessonId,
          payload.lessonVersion,
          payload.attendanceVersion,
        );
      if (Number(update.changes || 0) !== 1) {
        const error = new Error("Lesson changed during financial confirmation");
        error.status = 409;
        throw error;
      }
      affectedStudents.forEach((studentId) => this.syncStudentBalance(tenantId, studentId));
      const afterLesson = this.lesson(tenantId, lessonId);
      this.insertLessonEvent(
        tenantId,
        lessonId,
        { userId: payload.actorUserId, role: payload.actorRole },
        "finance_confirmed",
        "",
        lessonStateSnapshot(beforeLesson),
        { ...lessonStateSnapshot(afterLesson), settlementId, totals: preview.totals },
      );
      const result = { settlementId, financialVersion: nextFinancialVersion, totals: preview.totals };
      this.db
        .prepare(
          `UPDATE lesson_financial_runs
           SET status = 'succeeded', result_json = ?, completed_at = ?
           WHERE tenant_id = ? AND id = ?`,
        )
        .run(JSON.stringify(result), timestamp, tenantId, runId);
      this.db.exec("COMMIT");
      return this.lessonFinanceResult(tenantId, lessonId, false);
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (String(error.code || "").startsWith("SQLITE_CONSTRAINT") && !error.status) error.status = 409;
      throw error;
    }
  }

  reverseLessonFinance(tenantId, lessonId, payload) {
    const beforeLesson = this.lesson(tenantId, lessonId);
    if (!beforeLesson) return null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existingRun = this.financialRunByKey(tenantId, payload.idempotencyKey);
      if (existingRun) {
        if (existingRun.lessonId !== lessonId || existingRun.operation !== "reverse" || existingRun.requestFingerprint !== payload.requestFingerprint) {
          const error = new Error("idempotencyKey was already used with a different financial request");
          error.status = 409;
          throw error;
        }
        this.db.exec("COMMIT");
        return this.lessonFinanceResult(tenantId, lessonId, true);
      }
      const settlement = this.activeLessonSettlement(tenantId, lessonId);
      if (!settlement || settlement.id !== payload.settlementId || settlement.version !== payload.settlementVersion) {
        const error = new Error("Active financial settlement changed before reversal");
        error.status = 409;
        throw error;
      }
      const closedPeriod = this.closedFinancePeriod(tenantId, beforeLesson.branchId || "", payload.postingDate);
      if (closedPeriod) {
        const error = new Error(`Current posting period is closed: ${closedPeriod.label}`);
        error.status = 409;
        throw error;
      }
      const timestamp = now();
      const nextFinancialVersion = Number(beforeLesson.financialVersion || 0) + 1;
      const runId = id();
      this.db
        .prepare(
          `INSERT INTO lesson_financial_runs
           (id, tenant_id, lesson_id, idempotency_key, request_fingerprint, financial_version,
            operation, status, result_json, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'reverse', 'pending', '{}', ?, ?)`,
        )
        .run(
          runId,
          tenantId,
          lessonId,
          payload.idempotencyKey,
          payload.requestFingerprint,
          nextFinancialVersion,
          payload.actorUserId || "system",
          timestamp,
        );

      const postings = this.db
        .prepare(
          `SELECT * FROM lesson_student_postings
           WHERE tenant_id = ? AND settlement_id = ? AND status = 'active'
           ORDER BY student_id`,
        )
        .all(tenantId, settlement.id);
      const affectedStudents = new Set();
      postings.forEach((posting) => {
        let reversalTransactionId = null;
        if (Number(posting.charge_amount || 0) > 0) {
          const reversalKey = `${posting.idempotency_key}:reversal`;
          const transaction = this.insertTransaction(tenantId, posting.student_id, {
            branchId: settlement.branchId || "",
            type: "correction",
            effect: "credit",
            amount: Number(posting.charge_amount),
            currency: posting.currency || "UZS",
            description: `${beforeLesson.date} ${beforeLesson.groupName} darsi reversal: ${payload.reason}`,
            invoiceDate: payload.postingDate,
            idempotencyKey: reversalKey,
            requestFingerprint: payload.requestFingerprint,
            sourceType: "lesson_settlement_reversal",
            sourceId: settlement.id,
            reversalOfId: posting.ledger_transaction_id,
          });
          reversalTransactionId = transaction.id;
          affectedStudents.add(posting.student_id);
        }
        this.db
          .prepare(
            `UPDATE lesson_student_postings
             SET status = 'reversed', reversal_transaction_id = ?, reversal_settlement_id = ?,
                 reversed_at = ?, reversed_by = ?, reversal_reason = ?
             WHERE tenant_id = ? AND id = ? AND status = 'active'`,
          )
          .run(
            reversalTransactionId,
            settlement.id,
            timestamp,
            payload.actorUserId || "system",
            payload.reason,
            tenantId,
            posting.id,
          );
      });

      const originalAccruals = this.db
        .prepare(
          `SELECT * FROM teacher_accruals
           WHERE tenant_id = ? AND settlement_id = ? AND entry_type = 'accrual'
           ORDER BY id`,
        )
        .all(tenantId, settlement.id);
      const insertAccrualReversal = this.db.prepare(
        `INSERT INTO teacher_accruals
         (id, tenant_id, settlement_id, lesson_id, teacher_id, financial_run_id, rate_rule_id,
          revision, entry_type, original_entry_id, rate_type_snapshot, rate_amount_snapshot,
          duration_minutes_snapshot, basis_quantity_snapshot, basis_snapshot_json,
          accrual_amount, currency, idempotency_key, reversal_reason, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reversal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      originalAccruals.forEach((accrual) => {
        insertAccrualReversal.run(
          id(),
          tenantId,
          settlement.id,
          lessonId,
          accrual.teacher_id,
          runId,
          accrual.rate_rule_id,
          accrual.revision,
          accrual.id,
          accrual.rate_type_snapshot,
          accrual.rate_amount_snapshot,
          accrual.duration_minutes_snapshot,
          accrual.basis_quantity_snapshot,
          accrual.basis_snapshot_json,
          accrual.accrual_amount,
          accrual.currency,
          `${accrual.idempotency_key}:reversal`,
          payload.reason,
          payload.actorUserId || "system",
          timestamp,
        );
      });

      const settlementUpdate = this.db
        .prepare(
          `UPDATE lesson_financial_settlements
           SET status = 'reversed', reversed_by = ?, reversed_at = ?, reversal_reason = ?, version = version + 1
           WHERE tenant_id = ? AND id = ? AND status = 'confirmed' AND version = ?`,
        )
        .run(
          payload.actorUserId || "system",
          timestamp,
          payload.reason,
          tenantId,
          settlement.id,
          payload.settlementVersion,
        );
      if (Number(settlementUpdate.changes || 0) !== 1) {
        const error = new Error("Settlement changed during reversal");
        error.status = 409;
        throw error;
      }
      const lessonUpdate = this.db
        .prepare(
          `UPDATE lessons
           SET financial_status = 'reversed', financial_version = ?,
               financial_reversed_at = ?, financial_reversed_by = ?, financial_reversal_reason = ?,
               updated_by = ?, updated_at = ?, version = version + 1
           WHERE tenant_id = ? AND id = ? AND financial_status = 'posted'`,
        )
        .run(
          nextFinancialVersion,
          timestamp,
          payload.actorUserId || "system",
          payload.reason,
          payload.actorUserId || "system",
          timestamp,
          tenantId,
          lessonId,
        );
      if (Number(lessonUpdate.changes || 0) !== 1) {
        const error = new Error("Lesson changed during financial reversal");
        error.status = 409;
        throw error;
      }
      affectedStudents.forEach((studentId) => this.syncStudentBalance(tenantId, studentId));
      const afterLesson = this.lesson(tenantId, lessonId);
      this.insertLessonEvent(
        tenantId,
        lessonId,
        { userId: payload.actorUserId, role: payload.actorRole },
        "finance_reversed",
        payload.reason,
        { ...lessonStateSnapshot(beforeLesson), settlementId: settlement.id },
        { ...lessonStateSnapshot(afterLesson), settlementId: settlement.id },
      );
      const result = { settlementId: settlement.id, financialVersion: nextFinancialVersion };
      this.db
        .prepare(
          `UPDATE lesson_financial_runs
           SET status = 'succeeded', result_json = ?, completed_at = ?
           WHERE tenant_id = ? AND id = ?`,
        )
        .run(JSON.stringify(result), timestamp, tenantId, runId);
      this.db.exec("COMMIT");
      return this.lessonFinanceResult(tenantId, lessonId, false);
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (String(error.code || "").startsWith("SQLITE_CONSTRAINT") && !error.status) error.status = 409;
      throw error;
    }
  }

  updateLesson(tenantId, lessonId, payload) {
    const beforeLesson = this.lesson(tenantId, lessonId);
    if (!beforeLesson) return null;
    const timestamp = now();
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `UPDATE lessons
           SET date = ?, time = ?, start_time = ?, end_time = ?, teacher_id = ?,
               room_id = ?, room_name = ?, topic = ?, homework = ?, note = ?,
               reschedule_reason = ?, override_mask = override_mask | ?,
               updated_by = ?, updated_at = ?, version = version + 1
           WHERE tenant_id = ? AND id = ?`,
        )
        .run(
          payload.date,
          `${payload.startTime} - ${payload.endTime}`,
          payload.startTime,
          payload.endTime,
          payload.teacherId || null,
          payload.roomId || null,
          payload.roomName || "",
          payload.topic || "",
          payload.homework || "",
          payload.note || "",
          payload.reason || "",
          Number(payload.overrideMask || 0),
          payload.actorUserId || "system",
          timestamp,
          tenantId,
          lessonId,
        );
      const afterLesson = this.lesson(tenantId, lessonId);
      this.insertLessonEvent(
        tenantId,
        lessonId,
        { userId: payload.actorUserId, role: payload.actorRole },
        payload.schedulingChanged ? "rescheduled" : "updated",
        payload.reason || "",
        lessonStateSnapshot(beforeLesson),
        lessonStateSnapshot(afterLesson),
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) error.status = 409;
      throw error;
    }
    return this.lesson(tenantId, lessonId);
  }

  cancelLesson(tenantId, lessonId, payload) {
    const beforeLesson = this.lesson(tenantId, lessonId);
    if (!beforeLesson) return null;
    if (beforeLesson.status === "cancelled") return beforeLesson;
    const timestamp = now();
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `UPDATE lessons
           SET cancelled_from_status = status, status = 'cancelled', cancelled_reason = ?,
               cancelled_by = ?, cancelled_at = ?, updated_by = ?, updated_at = ?, version = version + 1
           WHERE tenant_id = ? AND id = ?`,
        )
        .run(payload.reason, payload.actorUserId || "system", timestamp, payload.actorUserId || "system", timestamp, tenantId, lessonId);
      const afterLesson = this.lesson(tenantId, lessonId);
      this.insertLessonEvent(
        tenantId,
        lessonId,
        { userId: payload.actorUserId, role: payload.actorRole },
        "cancelled",
        payload.reason,
        lessonStateSnapshot(beforeLesson),
        lessonStateSnapshot(afterLesson),
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.lesson(tenantId, lessonId);
  }

  restoreLesson(tenantId, lessonId, payload) {
    const beforeLesson = this.lesson(tenantId, lessonId);
    if (!beforeLesson) return null;
    const timestamp = now();
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `UPDATE lessons
           SET status = CASE WHEN cancelled_from_status IN ('waiting', 'planned') THEN cancelled_from_status ELSE 'planned' END,
               cancelled_reason = NULL, cancelled_by = NULL, cancelled_at = NULL,
               updated_by = ?, updated_at = ?, version = version + 1
           WHERE tenant_id = ? AND id = ? AND status = 'cancelled'`,
        )
        .run(payload.actorUserId || "system", timestamp, tenantId, lessonId);
      const afterLesson = this.lesson(tenantId, lessonId);
      this.insertLessonEvent(
        tenantId,
        lessonId,
        { userId: payload.actorUserId, role: payload.actorRole },
        "restored",
        payload.reason || "",
        lessonStateSnapshot(beforeLesson),
        lessonStateSnapshot(afterLesson),
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.lesson(tenantId, lessonId);
  }

  reopenCompletedLesson(tenantId, lessonId, payload) {
    const beforeLesson = this.lesson(tenantId, lessonId);
    if (!beforeLesson) return null;
    const beforeRecords = this.attendanceForLesson(tenantId, lessonId).map((record) => ({
      studentId: record.studentId,
      status: record.status,
      reasonId: record.reasonId,
      reasonCode: record.reasonCode,
      chargePercent: record.chargePercent,
      note: record.note || "",
    }));
    const timestamp = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const lockedLesson = this.lesson(tenantId, lessonId);
      if (lockedLesson.status !== "completed") {
        const error = new Error("Only a completed lesson can be reopened");
        error.status = 409;
        throw error;
      }
      if (this.activeLessonSettlement(tenantId, lessonId)) {
        const error = new Error("Reverse the active financial settlement before reopening the lesson");
        error.status = 409;
        throw error;
      }
      const closedPeriod = this.closedFinancePeriod(tenantId, lockedLesson.branchId || "", lockedLesson.date);
      if (closedPeriod) {
        const error = new Error(`Finance period is closed: ${closedPeriod.label}`);
        error.status = 409;
        throw error;
      }
      this.db.prepare("DELETE FROM attendance WHERE tenant_id = ? AND lesson_id = ?").run(tenantId, lessonId);
      const update = this.db
        .prepare(
          `UPDATE lessons
           SET status = 'planned',
               financial_status = CASE WHEN financial_status = 'reversed' THEN 'reversed' ELSE 'unposted' END,
               completed_by = NULL, completed_at = NULL,
               updated_by = ?, updated_at = ?, version = version + 1
           WHERE tenant_id = ? AND id = ? AND status = 'completed'`,
        )
        .run(payload.actorUserId || "system", timestamp, tenantId, lessonId);
      if (Number(update.changes || 0) !== 1) {
        const error = new Error("Lesson changed while it was being reopened");
        error.status = 409;
        throw error;
      }
      const afterLesson = this.lesson(tenantId, lessonId);
      this.insertLessonEvent(
        tenantId,
        lessonId,
        { userId: payload.actorUserId, role: payload.actorRole },
        "completion_reversed",
        payload.reason,
        { ...lessonStateSnapshot(beforeLesson), attendance: beforeRecords },
        lessonStateSnapshot(afterLesson),
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.lesson(tenantId, lessonId);
  }

  studentsByGroup(tenantId, groupId) {
    return this.db
      .prepare(
        `SELECT s.*, g.name AS group_name, sg.relationship AS parent_relationship, guardian.email AS parent_email,
                COALESCE(NULLIF(s.telegram_chat_id, ''), guardian.telegram_chat_id, '') AS effective_telegram_chat_id,
                COALESCE((
                  SELECT SUM(CASE WHEN it.effect = 'credit' THEN it.amount WHEN it.effect = 'debit' THEN -it.amount WHEN it.type IN ('payment', 'discount') THEN it.amount ELSE -it.amount END)
                  FROM invoices_transactions it
                  WHERE it.student_id = s.id AND it.tenant_id = s.tenant_id
                    AND COALESCE(it.status, 'active') = 'active'
                ), s.balance, 0) AS ledger_balance
         FROM students s
         LEFT JOIN groups g ON g.id = s.group_id AND g.tenant_id = s.tenant_id
         LEFT JOIN student_guardians sg ON sg.tenant_id = s.tenant_id AND sg.student_id = s.id AND sg.is_primary = 1
         LEFT JOIN guardians guardian ON guardian.id = sg.guardian_id AND guardian.tenant_id = sg.tenant_id
         WHERE s.tenant_id = ? AND s.group_id = ? AND s.status != 'left'
         ORDER BY s.name`,
      )
      .all(tenantId, groupId)
      .map(camelStudent);
  }

  studentsForLesson(tenantId, lessonId) {
    return this.db
      .prepare(
        `SELECT s.*, g.name AS group_name, sg.relationship AS parent_relationship, guardian.email AS parent_email,
                COALESCE(NULLIF(s.telegram_chat_id, ''), guardian.telegram_chat_id, '') AS effective_telegram_chat_id,
                existing_attendance.status AS attendance_status,
                existing_attendance.reason_id AS attendance_reason_id,
                existing_attendance.reason_code AS attendance_reason_code,
                existing_attendance.reason_name AS attendance_reason_name,
                existing_attendance.note AS attendance_note,
                COALESCE((
                  SELECT SUM(CASE WHEN it.effect = 'credit' THEN it.amount WHEN it.effect = 'debit' THEN -it.amount WHEN it.type IN ('payment', 'discount') THEN it.amount ELSE -it.amount END)
                  FROM invoices_transactions it
                  WHERE it.student_id = s.id AND it.tenant_id = s.tenant_id
                    AND COALESCE(it.status, 'active') = 'active'
                ), s.balance, 0) AS ledger_balance,
                (SELECT COUNT(*) FROM attendance a WHERE a.tenant_id = s.tenant_id AND a.student_id = s.id) AS attendance_total,
                (SELECT COUNT(*) FROM attendance a WHERE a.tenant_id = s.tenant_id AND a.student_id = s.id AND a.status IN ('present', 'late')) AS attendance_present
         FROM lessons l
         JOIN groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
         JOIN students s ON s.tenant_id = l.tenant_id
         LEFT JOIN student_guardians sg ON sg.tenant_id = s.tenant_id AND sg.student_id = s.id AND sg.is_primary = 1
         LEFT JOIN guardians guardian ON guardian.id = sg.guardian_id AND guardian.tenant_id = sg.tenant_id
         LEFT JOIN attendance existing_attendance ON existing_attendance.tenant_id = l.tenant_id
           AND existing_attendance.lesson_id = l.id AND existing_attendance.student_id = s.id
         WHERE l.tenant_id = ? AND l.id = ?
           AND (
             existing_attendance.id IS NOT NULL
             OR EXISTS (
               SELECT 1
               FROM student_group_enrollments enrollment
               WHERE enrollment.tenant_id = l.tenant_id
                 AND enrollment.student_id = s.id
                 AND enrollment.group_id = l.group_id
                 AND enrollment.start_date <= l.date
                 AND (enrollment.end_date IS NULL OR enrollment.end_date = '' OR l.date < enrollment.end_date)
             )
           )
         ORDER BY s.name`,
      )
      .all(tenantId, lessonId)
      .map(camelStudent);
  }

  attendanceForLesson(tenantId, lessonId) {
    return this.db
      .prepare(
        `SELECT attendance.*, student.name AS student_name
         FROM attendance
         JOIN students student
           ON student.id = attendance.student_id AND student.tenant_id = attendance.tenant_id
         WHERE attendance.tenant_id = ? AND attendance.lesson_id = ?
         ORDER BY attendance.student_id`,
      )
      .all(tenantId, lessonId)
      .map(camelAttendance);
  }

  replaceAttendance(tenantId, lessonId, records, payload = {}) {
    const beforeLesson = this.lesson(tenantId, lessonId);
    if (!beforeLesson) return null;
    const beforeRecords = this.db
      .prepare(
        `SELECT student_id AS studentId, status, reason_id AS reasonId,
                COALESCE(reason_code, '') AS reasonCode, COALESCE(reason_name, '') AS reasonName,
                COALESCE(charge_percent, 0) AS chargePercent,
                COALESCE(consume_percent, 0) AS consumePercent,
                COALESCE(note, '') AS note
         FROM attendance WHERE tenant_id = ? AND lesson_id = ? ORDER BY student_id`,
      )
      .all(tenantId, lessonId);
    const snapshot = [...records]
      .map((record) => ({
        studentId: record.studentId,
        status: record.status,
        reasonId: record.reasonId,
        reasonCode: record.reasonCode,
        reasonName: record.reasonName,
        chargePercent: Number(record.chargePercent || 0),
        consumePercent: Number(record.consumePercent || 0),
        note: record.note || "",
      }))
      .sort((left, right) => left.studentId.localeCompare(right.studentId));
    const revisionNo = Number(beforeLesson.attendanceVersion || 0) + 1;
    const timestamp = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (this.activeLessonSettlement(tenantId, lessonId)) {
        const error = new Error("Reverse the active financial settlement before correcting attendance");
        error.status = 409;
        throw error;
      }
      const closedPeriod = this.closedFinancePeriod(tenantId, beforeLesson.branchId || "", beforeLesson.date);
      if (closedPeriod) {
        const error = new Error(`Finance period is closed: ${closedPeriod.label}`);
        error.status = 409;
        throw error;
      }
      this.db.prepare("DELETE FROM attendance WHERE tenant_id = ? AND lesson_id = ?").run(tenantId, lessonId);
      const stmt = this.db.prepare(
        `INSERT INTO attendance
         (id, tenant_id, lesson_id, student_id, status, reason_id, reason_code, reason_name,
          charge_percent, consume_percent, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      snapshot.forEach((record) => stmt.run(
        id(),
        tenantId,
        lessonId,
        record.studentId,
        record.status,
        record.reasonId,
        record.reasonCode,
        record.reasonName,
        record.chargePercent,
        record.consumePercent,
        record.note,
        timestamp,
      ));
      this.db
        .prepare(
          `INSERT INTO lesson_attendance_revisions
           (id, tenant_id, lesson_id, revision_no, actor_user_id, actor_role, reason, snapshot_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id(),
          tenantId,
          lessonId,
          revisionNo,
          payload.actorUserId || "system",
          payload.actorRole || "system",
          payload.reason || "",
          JSON.stringify(snapshot),
          timestamp,
        );
      this.db
        .prepare(
          `UPDATE lessons
           SET status = 'completed', attendance_version = ?, financial_status = 'pending',
               financial_posted_at = NULL, financial_posted_by = NULL,
               financial_reversed_at = NULL, financial_reversed_by = NULL, financial_reversal_reason = NULL,
               topic = ?, homework = ?, note = ?,
               completed_by = COALESCE(NULLIF(completed_by, ''), ?),
               completed_at = COALESCE(NULLIF(completed_at, ''), ?),
               updated_by = ?, updated_at = ?, version = version + 1
           WHERE tenant_id = ? AND id = ?`,
        )
        .run(
          revisionNo,
          payload.topic || "",
          payload.homework || "",
          payload.note || "",
          payload.actorUserId || "system",
          timestamp,
          payload.actorUserId || "system",
          timestamp,
          tenantId,
          lessonId,
        );
      const afterLesson = this.lesson(tenantId, lessonId);
      this.insertLessonEvent(
        tenantId,
        lessonId,
        { userId: payload.actorUserId, role: payload.actorRole },
        beforeLesson.status === "completed" ? "attendance_corrected" : "completed",
        payload.reason || "",
        { ...lessonStateSnapshot(beforeLesson), attendance: beforeRecords },
        { ...lessonStateSnapshot(afterLesson), attendance: snapshot },
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.lesson(tenantId, lessonId);
  }

  sendAttendanceAlerts(tenantId, lessonId, teacherId = null) {
    const lesson = this.db
      .prepare(
        `SELECT l.id, l.time, l.date, l.status, l.attendance_version,
                g.name AS group_name, g.subject,
                COALESCE(l.teacher_id, s.teacher_id, g.teacher_id) AS teacher_id,
                t.name AS teacher_name, COALESCE(NULLIF(l.start_time, ''), s.start_time) AS start_time
         FROM lessons l
         JOIN groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
         LEFT JOIN schedules s ON s.id = l.schedule_id AND s.tenant_id = l.tenant_id
         LEFT JOIN teachers t ON t.id = COALESCE(l.teacher_id, s.teacher_id, g.teacher_id) AND t.tenant_id = g.tenant_id
         WHERE l.tenant_id = ? AND l.id = ?
         LIMIT 1`,
      )
      .get(tenantId, lessonId);
    if (!lesson) {
      const error = new Error("Lesson not found");
      error.status = 404;
      throw error;
    }
    if (teacherId && lesson.teacher_id !== teacherId) {
      const error = new Error("Only assigned teacher can send attendance alerts");
      error.status = 403;
      throw error;
    }
    if (lesson.status !== "completed") {
      const error = new Error("Attendance alerts require a completed lesson");
      error.status = 409;
      throw error;
    }

    const records = this.db
      .prepare(
        `SELECT a.status, s.id AS student_id, s.name AS student_name,
                CASE
                  WHEN sg.id IS NOT NULL AND COALESCE(sg.receives_notifications, 1) != 1 THEN NULL
                  ELSE COALESCE(NULLIF(guardian.telegram_chat_id, ''), NULLIF(s.telegram_chat_id, ''))
                END AS telegram_chat_id
         FROM attendance a
         JOIN students s ON s.id = a.student_id AND s.tenant_id = a.tenant_id
         LEFT JOIN student_guardians sg ON sg.tenant_id = s.tenant_id AND sg.student_id = s.id AND sg.is_primary = 1
         LEFT JOIN guardians guardian ON guardian.id = sg.guardian_id AND guardian.tenant_id = sg.tenant_id
         WHERE a.tenant_id = ? AND a.lesson_id = ? AND a.status IN ('absent', 'late')
         ORDER BY s.name`,
      )
      .all(tenantId, lessonId);
    const insertMessage = this.db.prepare(
      `INSERT OR IGNORE INTO messages
       (id, tenant_id, student_id, recipient, channel, text, status, attempts, created_at, dedupe_key)
       VALUES (?, ?, ?, ?, 'telegram', ?, 'queued', 0, ?, ?)`,
    );
    const timestamp = now();
    const subject = lesson.subject || lesson.group_name || "dars";
    const teacherName = lesson.teacher_name || "o'qituvchi";
    const startTime = lesson.start_time || String(lesson.time || "").split(/\s*[-–]\s*/)[0] || "";
    let sentCount = 0;
    let skippedCount = 0;
    let alreadyQueuedCount = 0;

    this.db.exec("BEGIN");
    try {
      records.forEach((record) => {
        if (!record.telegram_chat_id) {
          skippedCount += 1;
          return;
        }
        const stateText = record.status === "late" ? "kechikdi" : "kelmadi";
        const dateText = lesson.date === today() ? "bugun" : `${lesson.date} kungi`;
        const text = `Assalomu alaykum! 🎓 ${subject} guruhidan xabar. O'qituvchi: ${teacherName}. ${record.student_name} ${dateText} soat ${startTime} dagi darsga ${stateText}. Sababini bilish uchun guruhga yozavering.`;
        const dedupeKey = `attendance:${lesson.id}:${Number(lesson.attendance_version || 0)}:${record.student_id}:${record.status}`;
        const result = insertMessage.run(id(), tenantId, record.student_id, record.student_name, text, timestamp, dedupeKey);
        if (Number(result.changes || 0)) sentCount += 1;
        else alreadyQueuedCount += 1;
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      success: true,
      sent_count: sentCount,
      skipped_count: skippedCount,
      already_queued_count: alreadyQueuedCount,
    };
  }

  createPayment(tenantId, student, payload) {
    this.db.exec("BEGIN");
    try {
      const row = this.insertPayment(tenantId, student, payload);
      if (!row.reused) {
	        this.insertTransaction(tenantId, student.id, {
	          type: "payment",
	          amount: payload.amount,
	          description: `To'lov: ${payload.type}; payment:${row.id}`,
	          idempotencyKey: payload.idempotencyKey,
	          branchId: payload.branchId,
	          accountId: payload.accountId,
	          categoryId: payload.categoryId,
	        });
      }
      row.balance = this.syncStudentBalance(tenantId, student.id);
      this.db.exec("COMMIT");
      return row;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  updatePayment(tenantId, paymentId, student, payload) {
    const existing = this.payment(tenantId, paymentId);
    if (!existing) return null;
    const ledgerTransaction = this.paymentLedgerTransaction(tenantId, existing);
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare("UPDATE payments SET student_id = ?, student_name = ?, amount = ?, type = ? WHERE tenant_id = ? AND id = ?")
        .run(student.id, student.name, payload.amount, payload.type, tenantId, paymentId);
      if (ledgerTransaction) {
        this.db
          .prepare("UPDATE invoices_transactions SET student_id = ?, amount = ?, description = ?, invoice_date = ? WHERE tenant_id = ? AND id = ?")
          .run(student.id, payload.amount, `To'lov: ${payload.type}; payment:${existing.id}`, String(existing.createdAt || "").slice(0, 10) || today(), tenantId, ledgerTransaction.id);
      } else {
        this.insertTransaction(tenantId, student.id, {
          type: "payment",
          amount: payload.amount,
          description: `To'lov: ${payload.type}; payment:${existing.id}`,
          invoiceDate: String(existing.createdAt || "").slice(0, 10) || today(),
        });
      }
      const oldBalance = existing.studentId !== student.id ? this.syncStudentBalance(tenantId, existing.studentId) : null;
      const balance = this.syncStudentBalance(tenantId, student.id);
      this.db.exec("COMMIT");
      return { ...this.payment(tenantId, paymentId), balance, previousStudentId: existing.studentId, previousBalance: oldBalance };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  deletePayment(tenantId, paymentId, actorId = "", reason = "Payment voided") {
    const existing = this.payment(tenantId, paymentId);
    if (!existing) return null;
    const ledgerTransaction = this.paymentLedgerTransaction(tenantId, existing);
    this.db.exec("BEGIN");
    try {
      const timestamp = now();
      this.db
        .prepare(
          `UPDATE payments
           SET status = 'voided', voided_at = ?, voided_by = ?, void_reason = ?
           WHERE tenant_id = ? AND id = ? AND COALESCE(status, 'active') = 'active'`,
        )
        .run(timestamp, actorId || "", reason || "Payment voided", tenantId, paymentId);
      if (ledgerTransaction) {
        this.db
          .prepare(
            `UPDATE invoices_transactions
             SET status = 'voided', voided_at = ?, voided_by = ?, void_reason = ?
             WHERE tenant_id = ? AND id = ? AND COALESCE(status, 'active') = 'active'`,
          )
          .run(timestamp, actorId || "", reason || `Payment voided: ${paymentId}`, tenantId, ledgerTransaction.id);
      }
      const balance = this.syncStudentBalance(tenantId, existing.studentId);
      this.db.exec("COMMIT");
      return { ...existing, status: "voided", voidedAt: timestamp, voidedBy: actorId || "", voidReason: reason || "Payment voided", balance };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  createMessage(tenantId, payload) {
    const row = {
      id: id(),
      tenantId,
      studentId: payload.studentId || payload.student_id || null,
      status: "queued",
      attempts: 0,
      createdAt: now(),
      ...payload,
      channel: "telegram",
    };
    this.db.prepare("INSERT INTO messages (id, tenant_id, student_id, recipient, channel, text, status, attempts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      row.id,
      tenantId,
      row.studentId || null,
      row.to,
      row.channel,
      row.text,
      row.status,
      row.attempts,
      row.createdAt,
    );
    return row;
  }

  async processMessages(tenantId) {
    return this.telegramQueue.processMessages(tenantId);
  }

  retryFailedMessages(tenantId) {
    return this.telegramQueue.retryFailed(tenantId);
  }

  createStudentTelegramLink(tenantId, studentId, userId) {
    const tenant = this.tenant(tenantId);
    return this.telegramQueue.createStudentLink(tenantId, studentId, userId, tenant?.telegramBot || "");
  }

  async telegramBotIdentity(tenantId) {
    return this.telegramQueue.botIdentity(tenantId);
  }

  async processTelegramUpdates(tenantId) {
    return this.telegramQueue.processUpdates(tenantId);
  }

  async sendTelegramTestMessage(tenantId, chatId) {
    return this.telegramQueue.sendTelegramTestMessage(tenantId, chatId);
  }

  updateStudentChatId(tenantId, studentId, chatId) {
    const normalizedChatId = String(chatId || "").trim();
    const timestamp = now();
    const primaryGuardian = this.db
      .prepare(
        `SELECT guardian_id
         FROM student_guardians
         WHERE tenant_id = ? AND student_id = ? AND is_primary = 1
         LIMIT 1`,
      )
      .get(tenantId, studentId);
    this.db.exec("BEGIN");
    try {
      if (primaryGuardian) {
        this.db.prepare("UPDATE guardians SET telegram_chat_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
          .run(normalizedChatId, timestamp, tenantId, primaryGuardian.guardian_id);
        this.db.prepare(
          `UPDATE students SET telegram_chat_id = ?, updated_at = ?
           WHERE tenant_id = ? AND id IN (
             SELECT student_id FROM student_guardians WHERE tenant_id = ? AND guardian_id = ?
           )`,
        ).run(normalizedChatId, timestamp, tenantId, tenantId, primaryGuardian.guardian_id);
      } else {
        this.db.prepare("UPDATE students SET telegram_chat_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
          .run(normalizedChatId, timestamp, tenantId, studentId);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.student(tenantId, studentId);
  }

  createLead(tenantId, payload) {
    const row = { id: id(), tenantId, createdAt: now(), ...payload };
    this.db
      .prepare(
        `INSERT INTO leads (id, tenant_id, name, phone, source, status, stage, responsible_admin, next_action, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
      row.id,
      tenantId,
      row.name,
      row.phone || "",
      row.source || "Manual",
      row.status,
      row.stage,
      row.responsibleAdmin || "",
      row.nextAction || "",
      row.note || "",
      row.createdAt,
    );
    return row;
  }

  updateLeadStage(tenantId, leadId, stage) {
    this.db
      .prepare("UPDATE leads SET stage = ?, status = ? WHERE tenant_id = ? AND id = ?")
      .run(stage, statusForLeadStage(stage), tenantId, leadId);
    return this.lead(tenantId, leadId);
  }

  createPipelineStage(tenantId, payload) {
    const row = {
      id: id(),
      tenantId,
      name: payload.name,
      sortOrder: payload.sortOrder,
      isSystem: false,
    };
    const maxOrder = this.db
      .prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM pipeline_stages WHERE tenant_id = ?")
      .get(tenantId).max_order;
    row.sortOrder = Number(row.sortOrder || maxOrder + 1);
    this.db
      .prepare("INSERT INTO pipeline_stages (id, tenant_id, name, sort_order, created_at, is_system) VALUES (?, ?, ?, ?, ?, 0)")
      .run(row.id, tenantId, row.name, row.sortOrder, now());
    return this.pipelineStage(tenantId, row.id);
  }

  updatePipelineStage(tenantId, stageId, payload) {
    this.db.prepare("UPDATE pipeline_stages SET name = ? WHERE tenant_id = ? AND id = ?").run(payload.name, tenantId, stageId);
    return this.pipelineStage(tenantId, stageId);
  }

  deletePipelineStage(tenantId, stageId) {
    const stage = this.pipelineStage(tenantId, stageId);
    if (!stage) return null;
    if (stage.isSystem) {
      const error = new Error("Tizim bosqichlarini o'chirib bo'lmaydi");
      error.status = 403;
      throw error;
    }
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare("UPDATE leads SET stage = 'new', status = 'new' WHERE tenant_id = ? AND stage = (SELECT id FROM pipeline_stages WHERE tenant_id = ? AND id = ?)")
        .run(tenantId, tenantId, stageId);
      this.db.prepare("DELETE FROM pipeline_stages WHERE tenant_id = ? AND id = ?").run(tenantId, stageId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return stage;
  }

  subscriptions(tenantId) {
    return this.db
      .prepare(
        `SELECT sub.*, s.name AS student_name, g.name AS group_name
         FROM subscriptions sub
         JOIN students s ON s.id = sub.student_id AND s.tenant_id = sub.tenant_id
         LEFT JOIN groups g ON g.id = sub.group_id AND g.tenant_id = sub.tenant_id
         WHERE sub.tenant_id = ?
         ORDER BY sub.created_at DESC`,
      )
      .all(tenantId)
      .map(camelSubscription);
  }

  attendanceReasons(tenantId, activeOnly = true) {
    const whereActive = activeOnly ? "AND is_active = 1" : "";
    return this.db
      .prepare(
        `SELECT * FROM attendance_reasons
         WHERE tenant_id = ? ${whereActive}
         ORDER BY is_system DESC, attendance_status, name`,
      )
      .all(tenantId)
      .map(camelAttendanceReason);
  }

  attendanceReason(tenantId, reasonId) {
    const row = this.db.prepare("SELECT * FROM attendance_reasons WHERE tenant_id = ? AND id = ?").get(tenantId, reasonId);
    return row ? camelAttendanceReason(row) : null;
  }

  createAttendanceReason(tenantId, payload) {
    const rowId = id();
    const timestamp = now();
    try {
      this.db
        .prepare(
          `INSERT INTO attendance_reasons
           (id, tenant_id, code, name, attendance_status, charge_percent, consume_percent,
            is_active, is_system, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        )
        .run(
          rowId,
          tenantId,
          payload.code,
          payload.name,
          payload.attendanceStatus,
          payload.chargePercent,
          payload.consumePercent,
          timestamp,
          timestamp,
        );
    } catch (error) {
      if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) error.status = 409;
      throw error;
    }
    return this.attendanceReason(tenantId, rowId);
  }

  updateAttendanceReason(tenantId, reasonId, payload) {
    this.db
      .prepare(
        `UPDATE attendance_reasons
         SET name = ?, charge_percent = ?, consume_percent = ?, is_active = ?, updated_at = ?
         WHERE tenant_id = ? AND id = ?`,
      )
      .run(payload.name, payload.chargePercent, payload.consumePercent, payload.isActive ? 1 : 0, now(), tenantId, reasonId);
    return this.attendanceReason(tenantId, reasonId);
  }

  lessonBillingPolicies(tenantId) {
    return this.db
      .prepare(
        `SELECT policy.*, group_row.name AS group_name
         FROM lesson_billing_policies policy
         LEFT JOIN groups group_row
           ON group_row.id = policy.group_id AND group_row.tenant_id = policy.tenant_id
         WHERE policy.tenant_id = ?
         ORDER BY policy.valid_from DESC, policy.created_at DESC`,
      )
      .all(tenantId)
      .map(camelLessonBillingPolicy);
  }

  lessonBillingPolicy(tenantId, policyId) {
    const row = this.db
      .prepare(
        `SELECT policy.*, group_row.name AS group_name
         FROM lesson_billing_policies policy
         LEFT JOIN groups group_row
           ON group_row.id = policy.group_id AND group_row.tenant_id = policy.tenant_id
         WHERE policy.tenant_id = ? AND policy.id = ?`,
      )
      .get(tenantId, policyId);
    return row ? camelLessonBillingPolicy(row) : null;
  }

  createLessonBillingPolicy(tenantId, payload) {
    const overlap = this.db
      .prepare(
        `SELECT id FROM lesson_billing_policies
         WHERE tenant_id = ? AND status = 'active'
           AND COALESCE(branch_id, '') = COALESCE(?, '')
           AND COALESCE(group_id, '') = COALESCE(?, '')
           AND valid_from <= COALESCE(NULLIF(?, ''), '9999-12-31')
           AND COALESCE(NULLIF(valid_until, ''), '9999-12-31') >= ?
         LIMIT 1`,
      )
      .get(tenantId, payload.branchId || null, payload.groupId || null, payload.validUntil || null, payload.validFrom);
    if (overlap) {
      const error = new Error("Billing policy overlaps an active policy for the same scope");
      error.status = 409;
      throw error;
    }
    const version = Number(
      this.db
        .prepare(
          `SELECT COALESCE(MAX(version), 0) AS version
           FROM lesson_billing_policies
           WHERE tenant_id = ?
             AND COALESCE(branch_id, '') = COALESCE(?, '')
             AND COALESCE(group_id, '') = COALESCE(?, '')`,
        )
        .get(tenantId, payload.branchId || null, payload.groupId || null).version || 0,
    ) + 1;
    const rowId = id();
    const timestamp = now();
    this.db
      .prepare(
        `INSERT INTO lesson_billing_policies
         (id, tenant_id, branch_id, group_id, name, billing_mode, base_amount, currency,
          valid_from, valid_until, status, version, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'per_lesson', ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      )
      .run(
        rowId,
        tenantId,
        payload.branchId || null,
        payload.groupId || null,
        payload.name,
        payload.baseAmount,
        payload.currency || "UZS",
        payload.validFrom,
        payload.validUntil || null,
        version,
        payload.actorUserId || "system",
        timestamp,
        timestamp,
      );
    return this.lessonBillingPolicy(tenantId, rowId);
  }

  teacherRateRules(tenantId, teacherId = null) {
    const teacherFilter = teacherId ? "AND rule.teacher_id = ?" : "";
    const params = teacherId ? [tenantId, teacherId] : [tenantId];
    return this.db
      .prepare(
        `SELECT rule.*, teacher.name AS teacher_name, group_row.name AS group_name
         FROM teacher_rate_rules rule
         JOIN teachers teacher
           ON teacher.id = rule.teacher_id AND teacher.tenant_id = rule.tenant_id
         LEFT JOIN groups group_row
           ON group_row.id = rule.group_id AND group_row.tenant_id = rule.tenant_id
         WHERE rule.tenant_id = ? ${teacherFilter}
         ORDER BY rule.effective_from DESC, rule.created_at DESC`,
      )
      .all(...params)
      .map(camelTeacherRateRule);
  }

  teacherRateRule(tenantId, ruleId) {
    return this.teacherRateRules(tenantId).find((rule) => rule.id === ruleId) || null;
  }

  createTeacherRateRule(tenantId, payload) {
    const overlap = this.db
      .prepare(
        `SELECT id FROM teacher_rate_rules
         WHERE tenant_id = ? AND teacher_id = ? AND status = 'active'
           AND COALESCE(group_id, '') = COALESCE(?, '')
           AND COALESCE(lesson_type, '') = COALESCE(?, '')
           AND effective_from <= COALESCE(NULLIF(?, ''), '9999-12-31')
           AND COALESCE(NULLIF(effective_until, ''), '9999-12-31') >= ?
         LIMIT 1`,
      )
      .get(
        tenantId,
        payload.teacherId,
        payload.groupId || null,
        payload.lessonType || null,
        payload.effectiveUntil || null,
        payload.effectiveFrom,
      );
    if (overlap) {
      const error = new Error("Teacher rate overlaps an active rate for the same scope");
      error.status = 409;
      throw error;
    }
    const version = Number(
      this.db
        .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM teacher_rate_rules WHERE tenant_id = ? AND teacher_id = ?")
        .get(tenantId, payload.teacherId).version || 0,
    ) + 1;
    const rowId = id();
    const timestamp = now();
    this.db
      .prepare(
        `INSERT INTO teacher_rate_rules
         (id, tenant_id, branch_id, teacher_id, group_id, lesson_type, rate_type, rate_amount,
          currency, effective_from, effective_until, status, version, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      )
      .run(
        rowId,
        tenantId,
        payload.branchId || null,
        payload.teacherId,
        payload.groupId || null,
        payload.lessonType || null,
        payload.rateType,
        payload.amount,
        payload.currency || "UZS",
        payload.effectiveFrom,
        payload.effectiveUntil || null,
        version,
        payload.actorUserId || "system",
        timestamp,
        timestamp,
      );
    return this.teacherRateRule(tenantId, rowId);
  }

  archiveTeacherRateRule(tenantId, ruleId, payload) {
    const existing = this.teacherRateRule(tenantId, ruleId);
    if (!existing) return null;
    if (existing.status === "archived") return existing;
    const timestamp = now();
    this.db
      .prepare(
        `UPDATE teacher_rate_rules
         SET status = 'archived', archived_at = ?, archived_by = ?, archive_reason = ?,
             updated_by = ?, updated_at = ?, version = version + 1
         WHERE tenant_id = ? AND id = ?`,
      )
      .run(timestamp, payload.actorUserId || "system", payload.reason, payload.actorUserId || "system", timestamp, tenantId, ruleId);
    return this.teacherRateRule(tenantId, ruleId);
  }

  financePeriods(tenantId) {
    return this.db
      .prepare("SELECT * FROM finance_periods WHERE tenant_id = ? ORDER BY start_date DESC, created_at DESC")
      .all(tenantId)
      .map(camelFinancePeriod);
  }

  financePeriod(tenantId, periodId) {
    const row = this.db.prepare("SELECT * FROM finance_periods WHERE tenant_id = ? AND id = ?").get(tenantId, periodId);
    return row ? camelFinancePeriod(row) : null;
  }

  closedFinancePeriod(tenantId, branchId, date) {
    const row = this.db
      .prepare(
        `SELECT * FROM finance_periods
         WHERE tenant_id = ? AND status = 'closed'
           AND start_date <= ? AND end_date >= ?
           AND (branch_id IS NULL OR branch_id = '' OR branch_id = ?)
         ORDER BY CASE WHEN branch_id = ? THEN 0 ELSE 1 END, start_date DESC
         LIMIT 1`,
      )
      .get(tenantId, date, date, branchId || "", branchId || "");
    return row ? camelFinancePeriod(row) : null;
  }

  createFinancePeriod(tenantId, payload) {
    const rowId = id();
    const timestamp = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const overlap = this.db
        .prepare(
          `SELECT id FROM finance_periods
           WHERE tenant_id = ?
             AND COALESCE(branch_id, '') = COALESCE(?, '')
             AND start_date <= ? AND end_date >= ?
           LIMIT 1`,
        )
        .get(tenantId, payload.branchId || null, payload.endDate, payload.startDate);
      if (overlap) {
        const error = new Error("Finance period overlaps an existing period");
        error.status = 409;
        throw error;
      }
      this.db
        .prepare(
          `INSERT INTO finance_periods
           (id, tenant_id, branch_id, label, start_date, end_date, status, version, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'open', 1, ?, ?, ?)`,
        )
        .run(
          rowId,
          tenantId,
          payload.branchId || null,
          payload.label,
          payload.startDate,
          payload.endDate,
          payload.actorUserId || "system",
          timestamp,
          timestamp,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.financePeriod(tenantId, rowId);
  }

  closeFinancePeriod(tenantId, periodId, payload) {
    const initial = this.financePeriod(tenantId, periodId);
    if (!initial) return null;
    if (initial.status === "closed") return initial;
    const timestamp = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const period = this.financePeriod(tenantId, periodId);
      const unconfirmed = this.db
        .prepare(
          `SELECT id FROM lessons
           WHERE tenant_id = ? AND date BETWEEN ? AND ?
             AND status = 'completed' AND financial_status = 'pending'
             AND (? = '' OR branch_id = ?)
           LIMIT 1`,
        )
        .get(tenantId, period.startDate, period.endDate, period.branchId || "", period.branchId || "");
      if (unconfirmed) {
        const error = new Error("Finance period contains completed lessons awaiting financial confirmation");
        error.status = 409;
        throw error;
      }
      this.db
        .prepare(
          `UPDATE finance_periods
           SET status = 'closed', closed_at = ?, closed_by = ?, close_reason = ?,
               version = version + 1, updated_by = ?, updated_at = ?
           WHERE tenant_id = ? AND id = ? AND status = 'open'`,
        )
        .run(
          timestamp,
          payload.actorUserId || "system",
          payload.reason,
          payload.actorUserId || "system",
          timestamp,
          tenantId,
          periodId,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.financePeriod(tenantId, periodId);
  }

  reopenFinancePeriod(tenantId, periodId, payload) {
    const period = this.financePeriod(tenantId, periodId);
    if (!period) return null;
    if (period.status === "open") return period;
    const timestamp = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `UPDATE finance_periods
           SET status = 'open', reopened_at = ?, reopened_by = ?, reopened_reason = ?,
               version = version + 1, updated_by = ?, updated_at = ?
           WHERE tenant_id = ? AND id = ? AND status = 'closed'`,
        )
        .run(
          timestamp,
          payload.actorUserId || "system",
          payload.reason,
          payload.actorUserId || "system",
          timestamp,
          tenantId,
          periodId,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.financePeriod(tenantId, periodId);
  }

  createSubscription(tenantId, payload) {
    const row = {
      id: id(),
      tenantId,
      branchId: payload.branchId || this.mainBranch(tenantId)?.id || "",
      studentId: payload.studentId,
      groupId: payload.groupId || null,
      name: payload.name,
      status: payload.status || "active",
      startDate: payload.startDate,
      endDate: payload.endDate || "",
      lessonsTotal: Number(payload.lessonsTotal || 0),
      lessonsUsed: Number(payload.lessonsUsed || 0),
      amount: Number(payload.amount || 0),
      createdAt: now(),
    };
    this.db
      .prepare(
        `INSERT INTO subscriptions (id, tenant_id, branch_id, student_id, group_id, name, status, start_date, end_date, lessons_total, lessons_used, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, tenantId, row.branchId || null, row.studentId, row.groupId, row.name, row.status, row.startDate, row.endDate || null, row.lessonsTotal, row.lessonsUsed, row.amount, row.createdAt);
    return this.subscriptions(tenantId).find((item) => item.id === row.id);
  }

  teacherWorkingHours(tenantId, teacherId = null) {
    const params = teacherId ? [tenantId, teacherId] : [tenantId];
    const where = teacherId ? "WHERE wh.tenant_id = ? AND wh.teacher_id = ?" : "WHERE wh.tenant_id = ?";
    return this.db
      .prepare(
        `SELECT wh.*, t.name AS teacher_name
         FROM teacher_working_hours wh
         JOIN teachers t ON t.id = wh.teacher_id AND t.tenant_id = wh.tenant_id
         ${where}
         ORDER BY t.name, CAST(wh.weekday AS INTEGER), wh.start_time`,
      )
      .all(...params)
      .map(camelTeacherWorkingHour);
  }

  createTeacherWorkingHour(tenantId, payload) {
    const row = {
      id: id(),
      tenantId,
      branchId: payload.branchId || this.mainBranch(tenantId)?.id || "",
      teacherId: payload.teacherId,
      weekday: payload.weekday,
      startTime: payload.startTime,
      endTime: payload.endTime,
      createdAt: now(),
    };
    this.db
      .prepare(
        `INSERT OR IGNORE INTO teacher_working_hours (id, tenant_id, branch_id, teacher_id, weekday, start_time, end_time, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, tenantId, row.branchId || null, row.teacherId, row.weekday, row.startTime, row.endTime, row.createdAt);
    return this.teacherWorkingHours(tenantId, row.teacherId).find((item) => item.weekday === row.weekday && item.startTime === row.startTime && item.endTime === row.endTime);
  }

  overlappingTeacherWorkingHour(tenantId, teacherId, weekday, startTime, endTime) {
    return this.db.prepare(
      `SELECT id FROM teacher_working_hours
       WHERE tenant_id = ? AND teacher_id = ? AND weekday = ? AND start_time < ? AND end_time > ?
       LIMIT 1`,
    ).get(tenantId, teacherId, weekday, endTime, startTime) || null;
  }

  deleteTeacherWorkingHour(tenantId, workingHourId) {
    const row = this.db.prepare("SELECT * FROM teacher_working_hours WHERE tenant_id = ? AND id = ?").get(tenantId, workingHourId);
    if (!row) return null;
    this.db.prepare("DELETE FROM teacher_working_hours WHERE tenant_id = ? AND id = ?").run(tenantId, workingHourId);
    return camelTeacherWorkingHour(row);
  }

  financeAccounts(tenantId) {
    return this.db.prepare("SELECT * FROM finance_accounts WHERE tenant_id = ? ORDER BY status, name").all(tenantId).map(camelFinanceAccount);
  }

  createFinanceAccount(tenantId, payload) {
    const row = {
      id: id(),
      tenantId,
      name: payload.name,
      type: payload.type,
      status: "active",
      createdAt: now(),
    };
    this.db.prepare("INSERT INTO finance_accounts (id, tenant_id, name, type, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)").run(row.id, tenantId, row.name, row.type, row.createdAt);
    return this.financeAccounts(tenantId).find((item) => item.id === row.id);
  }

  financeCategories(tenantId) {
    return this.db.prepare("SELECT * FROM finance_categories WHERE tenant_id = ? ORDER BY kind, name").all(tenantId).map(camelFinanceCategory);
  }

  createFinanceCategory(tenantId, payload) {
    const row = {
      id: id(),
      tenantId,
      name: payload.name,
      kind: payload.kind,
      isSystem: false,
      createdAt: now(),
    };
    this.db
      .prepare("INSERT INTO finance_categories (id, tenant_id, name, kind, is_system, created_at) VALUES (?, ?, ?, ?, 0, ?)")
      .run(row.id, tenantId, row.name, row.kind, row.createdAt);
    return this.financeCategories(tenantId).find((item) => item.id === row.id);
  }

  tasks(tenantId, userId = null, role = "admin") {
    const params = role === "teacher" ? [tenantId, userId] : [tenantId];
    const where =
      role === "teacher"
        ? "WHERE task.tenant_id = ? AND (task.assignee_user_id = ? OR task.assignee_user_id IS NULL)"
        : "WHERE task.tenant_id = ?";
    return this.db
      .prepare(
        `SELECT task.*, assignee.name AS assignee_name, author.name AS author_name
         FROM tasks task
         LEFT JOIN users assignee ON assignee.id = task.assignee_user_id AND assignee.tenant_id = task.tenant_id
         LEFT JOIN users author ON author.id = task.author_user_id
         ${where}
         ORDER BY CASE task.status WHEN 'open' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
                  COALESCE(task.due_at, '9999-12-31T23:59:59.999Z'),
                  task.created_at DESC`,
      )
      .all(...params)
      .map(camelTask);
  }

  task(tenantId, taskId) {
    const row = this.db.prepare("SELECT * FROM tasks WHERE tenant_id = ? AND id = ?").get(tenantId, taskId);
    return row ? camelTask(row) : null;
  }

  createTask(tenantId, payload) {
    const row = {
      id: id(),
      tenantId,
      title: payload.title,
      status: "open",
      priority: payload.priority || "normal",
      dueAt: payload.dueAt || "",
      assigneeUserId: payload.assigneeUserId || null,
      authorUserId: payload.authorUserId || null,
      relatedType: payload.relatedType || "",
      relatedId: payload.relatedId || "",
      note: payload.note || "",
      createdAt: now(),
    };
    this.db
      .prepare(
        `INSERT INTO tasks (id, tenant_id, title, status, priority, due_at, assignee_user_id, author_user_id, related_type, related_id, note, created_at)
         VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, tenantId, row.title, row.priority, row.dueAt || null, row.assigneeUserId, row.authorUserId, row.relatedType, row.relatedId, row.note, row.createdAt);
    return this.tasks(tenantId).find((item) => item.id === row.id);
  }

  updateTask(tenantId, taskId, payload) {
    const existing = this.task(tenantId, taskId);
    if (!existing) return null;
    const status = payload.status || existing.status;
    this.db
      .prepare(
        `UPDATE tasks
         SET title = ?, status = ?, priority = ?, due_at = ?, assignee_user_id = ?, related_type = ?, related_id = ?, note = ?,
             completed_at = CASE WHEN ? = 'completed' AND completed_at IS NULL THEN ? ELSE completed_at END,
             archived_at = CASE WHEN ? = 'archived' AND archived_at IS NULL THEN ? ELSE archived_at END
         WHERE tenant_id = ? AND id = ?`,
      )
      .run(
        payload.title || existing.title,
        status,
        payload.priority || existing.priority,
        payload.dueAt === undefined ? existing.dueAt || null : payload.dueAt || null,
        payload.assigneeUserId === undefined ? existing.assigneeUserId || null : payload.assigneeUserId || null,
        payload.relatedType === undefined ? existing.relatedType || "" : payload.relatedType || "",
        payload.relatedId === undefined ? existing.relatedId || "" : payload.relatedId || "",
        payload.note === undefined ? existing.note || "" : payload.note || "",
        status,
        now(),
        status,
        now(),
        tenantId,
        taskId,
      );
    return this.tasks(tenantId).find((item) => item.id === taskId);
  }

  convertLeadToStudent(tenantId, leadId, payload) {
    const lead = this.lead(tenantId, leadId);
    if (!lead) return null;
    const group = this.group(tenantId, payload.groupId);
    if (!group) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }
    const studentId = id();
    const branchId = payload.branchId || this.mainBranch(tenantId)?.id || null;
    const debt = Number(payload.debt || 0);
    const timestamp = now();
    const enrollmentDate = payload.enrollmentDate || today();
    const parentName = payload.parentName || "";
    const phone = payload.phone || lead.phone || "";
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `INSERT INTO students
           (id, tenant_id, branch_id, name, group_id, parent_name, phone, phone_normalized, student_phone, email, birth_date, gender, address, source, enrollment_date, note, telegram_chat_id, debt, balance, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?)`,
        )
        .run(
          studentId,
          tenantId,
          branchId,
          payload.name || lead.name,
          payload.groupId,
          parentName,
          phone,
          normalizePhone(phone),
          payload.studentPhone || "",
          payload.email || "",
          payload.birthDate || null,
          payload.gender || "",
          payload.address || "",
          payload.source || lead.source || "Lead",
          enrollmentDate,
          payload.note || lead.note || "",
          payload.telegramChatId || "",
          debt,
          timestamp,
          timestamp,
        );
      this.upsertPrimaryGuardian(tenantId, studentId, { ...payload, parentName, phone });
      this.openStudentEnrollment(tenantId, studentId, payload.groupId, enrollmentDate, "Lead conversion", payload.actorUserId);
      if (debt > 0) {
        this.insertTransaction(tenantId, studentId, {
          type: "charge",
          amount: debt,
          description: "Lead konvertatsiyasi bo'yicha boshlang'ich qarz",
          branchId,
        });
      }
      this.syncStudentBalance(tenantId, studentId);
      this.db
        .prepare("UPDATE leads SET status = 'converted', stage = 'paid', converted_student_id = ? WHERE tenant_id = ? AND id = ?")
        .run(studentId, tenantId, leadId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { lead: this.lead(tenantId, leadId), student: this.student(tenantId, studentId) };
  }

  importStudents(tenantId, students) {
    const stmt = this.db.prepare(
      `INSERT INTO students
       (id, tenant_id, branch_id, name, phone, phone_normalized, parent_name, group_id, student_phone, email, birth_date, gender, address, source, enrollment_date, note, telegram_chat_id, debt, balance, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?)`,
    );
    const branchId = this.mainBranch(tenantId)?.id || null;
    this.db.exec("BEGIN");
    try {
      students.forEach((student) => {
        const studentId = id();
        const debt = Number(student.debt || 0);
        const timestamp = now();
        const enrollmentDate = student.enrollmentDate || today();
        stmt.run(
          studentId,
          tenantId,
          branchId,
          student.name,
          student.phone || "",
          normalizePhone(student.phone),
          student.parentName || "",
          student.groupId,
          student.studentPhone || "",
          student.email || "",
          student.birthDate || null,
          student.gender || "",
          student.address || "",
          student.source || "CSV import",
          enrollmentDate,
          student.note || "",
          student.telegramChatId || "",
          debt,
          timestamp,
          timestamp,
        );
        this.upsertPrimaryGuardian(tenantId, studentId, student);
        this.openStudentEnrollment(tenantId, studentId, student.groupId, enrollmentDate, "CSV import", student.actorUserId);
        if (debt > 0) {
          this.insertTransaction(tenantId, studentId, {
            type: "charge",
            amount: debt,
            description: "Boshlang'ich qarz",
            branchId,
          });
          this.syncStudentBalance(tenantId, studentId);
        }
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return students.length;
  }

  student(tenantId, studentId) {
    const row = this.db
      .prepare(
        `SELECT s.*, g.name AS group_name, sg.relationship AS parent_relationship, guardian.email AS parent_email,
                COALESCE(NULLIF(s.telegram_chat_id, ''), guardian.telegram_chat_id, '') AS effective_telegram_chat_id,
                COALESCE((
                  SELECT SUM(CASE WHEN it.effect = 'credit' THEN it.amount WHEN it.effect = 'debit' THEN -it.amount WHEN it.type IN ('payment', 'discount') THEN it.amount ELSE -it.amount END)
                  FROM invoices_transactions it
                  WHERE it.student_id = s.id AND it.tenant_id = s.tenant_id
                    AND COALESCE(it.status, 'active') = 'active'
                ), s.balance, 0) AS ledger_balance,
                (SELECT COUNT(*) FROM attendance a WHERE a.tenant_id = s.tenant_id AND a.student_id = s.id) AS attendance_total,
                (SELECT COUNT(*) FROM attendance a WHERE a.tenant_id = s.tenant_id AND a.student_id = s.id AND a.status IN ('present', 'late')) AS attendance_present
         FROM students s
         LEFT JOIN groups g ON g.id = s.group_id AND g.tenant_id = s.tenant_id
         LEFT JOIN student_guardians sg ON sg.tenant_id = s.tenant_id AND sg.student_id = s.id AND sg.is_primary = 1
         LEFT JOIN guardians guardian ON guardian.id = sg.guardian_id AND guardian.tenant_id = sg.tenant_id
         WHERE s.tenant_id = ? AND s.id = ?
         LIMIT 1`,
      )
      .get(tenantId, studentId);
    return row ? camelStudent(row) : null;
  }

  studentProfile(tenantId, studentId) {
    const student = this.student(tenantId, studentId);
    if (!student) return null;

    const guardians = this.db
      .prepare(
        `SELECT g.*, sg.relationship, sg.is_primary, sg.is_emergency, sg.receives_notifications
         FROM student_guardians sg
         JOIN guardians g ON g.id = sg.guardian_id AND g.tenant_id = sg.tenant_id
         WHERE sg.tenant_id = ? AND sg.student_id = ?
         ORDER BY sg.is_primary DESC, sg.receives_notifications DESC, g.name`,
      )
      .all(tenantId, studentId)
      .map(camelGuardian);

    const enrollments = this.db
      .prepare(
        `SELECT enrollment.*, g.name AS group_name, g.subject, g.teacher_id, t.name AS teacher_name
         FROM student_group_enrollments enrollment
         JOIN groups g ON g.id = enrollment.group_id AND g.tenant_id = enrollment.tenant_id
         LEFT JOIN teachers t ON t.id = g.teacher_id AND t.tenant_id = g.tenant_id
         WHERE enrollment.tenant_id = ? AND enrollment.student_id = ?
         ORDER BY CASE enrollment.status WHEN 'active' THEN 0 ELSE 1 END,
                  enrollment.start_date DESC, enrollment.created_at DESC`,
      )
      .all(tenantId, studentId)
      .map(camelEnrollment);

    const attendanceRow = this.db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late,
                SUM(CASE WHEN status = 'excused' THEN 1 ELSE 0 END) AS excused
         FROM attendance
         WHERE tenant_id = ? AND student_id = ?`,
      )
      .get(tenantId, studentId);
    const attendanceSummary = {
      total: Number(attendanceRow?.total || 0),
      present: Number(attendanceRow?.present || 0),
      absent: Number(attendanceRow?.absent || 0),
      late: Number(attendanceRow?.late || 0),
      excused: Number(attendanceRow?.excused || 0),
      rate: 0,
    };
    attendanceSummary.rate = attendanceSummary.total
      ? Math.round(((attendanceSummary.present + attendanceSummary.late) / attendanceSummary.total) * 100)
      : 0;

    const attendanceRecords = this.db
      .prepare(
        `SELECT a.*, s.name AS student_name, s.parent_name, l.group_id, l.time AS lesson_time, l.date AS lesson_date,
                g.name AS group_name, g.subject, COALESCE(l.teacher_id, g.teacher_id) AS teacher_id
         FROM attendance a
         JOIN students s ON s.id = a.student_id AND s.tenant_id = a.tenant_id
         JOIN lessons l ON l.id = a.lesson_id AND l.tenant_id = a.tenant_id
         JOIN groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
         WHERE a.tenant_id = ? AND a.student_id = ?
         ORDER BY l.date DESC, l.time DESC, a.created_at DESC
         LIMIT 100`,
      )
      .all(tenantId, studentId)
      .map(camelAttendance);

    const subscriptions = this.db
      .prepare(
        `SELECT sub.*, s.name AS student_name, g.name AS group_name
         FROM subscriptions sub
         JOIN students s ON s.id = sub.student_id AND s.tenant_id = sub.tenant_id
         LEFT JOIN groups g ON g.id = sub.group_id AND g.tenant_id = sub.tenant_id
         WHERE sub.tenant_id = ? AND sub.student_id = ?
         ORDER BY CASE sub.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
                  sub.start_date DESC, sub.created_at DESC`,
      )
      .all(tenantId, studentId)
      .map(camelSubscription);

    const upcomingLessons = this.db
      .prepare(
        `SELECT l.*, g.name AS group_name, g.subject, g.room,
                COALESCE(l.teacher_id, g.teacher_id) AS effective_teacher_id, t.name AS teacher_name
         FROM lessons l
         JOIN groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
         LEFT JOIN teachers t ON t.id = COALESCE(l.teacher_id, g.teacher_id) AND t.tenant_id = l.tenant_id
         WHERE l.tenant_id = ? AND l.date >= ? AND l.status IN ('waiting', 'planned')
           AND EXISTS (
             SELECT 1
             FROM student_group_enrollments enrollment
             WHERE enrollment.tenant_id = l.tenant_id
               AND enrollment.student_id = ?
               AND enrollment.group_id = l.group_id
               AND enrollment.start_date <= l.date
               AND (enrollment.end_date IS NULL OR l.date < enrollment.end_date)
           )
         ORDER BY l.date, l.time
         LIMIT 12`,
      )
      .all(tenantId, today(), studentId)
      .map(camelLesson);

    const recentPayments = this.db
      .prepare(
        `SELECT * FROM payments
         WHERE tenant_id = ? AND student_id = ?
           AND COALESCE(status, 'active') = 'active'
         ORDER BY created_at DESC
         LIMIT 10`,
      )
      .all(tenantId, studentId)
      .map(camelPayment);
    const ledger = this.getStudentLedger(tenantId, studentId);
    const balance = this.getStudentBalance(tenantId, studentId);
    const primaryGuardian = guardians.find((guardian) => guardian.isPrimary);

    return {
      student: {
        ...student,
        telegramChatId: student.telegramChatId || primaryGuardian?.telegramChatId || "",
        balance,
      },
      guardians,
      enrollments,
      attendance: { summary: attendanceSummary, records: attendanceRecords },
      subscriptions,
      upcomingLessons,
      recentPayments,
      ledger,
      balance,
    };
  }

  audit(context, action, entity, entityId) {
    this.db.prepare("INSERT INTO audit_logs (id, tenant_id, user_id, role, action, entity, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      id(),
      context.tenantId,
      context.userId,
      context.role,
      action,
      entity,
      entityId,
      now(),
    );
  }
}

module.exports = { AppRepository };
