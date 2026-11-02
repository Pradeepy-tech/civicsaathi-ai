import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull().default('department_officer'), // 'super_admin' | 'department_officer'
  departmentCode: text('department_code'), // null means access across all departments (for super_admin)
  cityScope: text('city_scope'), // null means all cities
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  nameEn: text('name_en').notNull(),
  nameHi: text('name_hi').notNull(),
  categoryMapped: text('category_mapped').notNull(),
  slaHoursCritical: integer('sla_hours_critical').notNull().default(6),
  slaHoursHigh: integer('sla_hours_high').notNull().default(24),
  slaHoursMedium: integer('sla_hours_medium').notNull().default(72),
  slaHoursLow: integer('sla_hours_low').notNull().default(120),
  contactEmail: text('contact_email').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export const wards = pgTable('wards', {
  id: serial('id').primaryKey(),
  city: text('city').notNull(),
  municipalBody: text('municipal_body').notNull(),
  wardNumber: integer('ward_number').notNull(),
  wardName: text('ward_name').notNull(),
  wardCode: text('ward_code').notNull().unique(),
  verifiedLocalities: text('verified_localities').notNull(),
  zoneName: text('zone_name').notNull(),
});

export const complaints = pgTable('complaints', {
  id: serial('id').primaryKey(),
  trackingCode: text('tracking_code').notNull().unique(),
  accessPinHash: text('access_pin_hash').notNull(),
  demoPinHint: text('demo_pin_hint'),
  language: text('language').notNull().default('hi'),
  rawDescription: text('raw_description').notNull(),
  interpretedSummary: text('interpreted_summary').notNull(),
  category: text('category').notNull(),
  priority: text('priority').notNull().default('Medium'),
  priorityReason: text('priority_reason').notNull(),
  classificationSource: text('classification_source').notNull().default('ai'), // 'ai' | 'rule_fallback'
  city: text('city').notNull(),
  wardCode: text('ward_code').notNull(),
  wardName: text('ward_name').notNull(),
  locality: text('locality').notNull(),
  landmark: text('landmark'),
  citizenName: text('citizen_name').notNull(),
  citizenPhone: text('citizen_phone'),
  citizenEmail: text('citizen_email'),
  departmentCode: text('department_code').notNull(),
  departmentName: text('department_name').notNull(),
  requiresManualAssignment: boolean('requires_manual_assignment').notNull().default(false),
  assignedOfficerUid: text('assigned_officer_uid'),
  assignedOfficerName: text('assigned_officer_name'),
  duplicateOfTrackingCode: text('duplicate_of_tracking_code'),
  status: text('status').notNull().default('Pending'), // 'Pending' | 'In Progress' | 'Resolved' | 'Rejected'
  slaDeadline: timestamp('sla_deadline').notNull(),
  isEscalated: boolean('is_escalated').notNull().default(false),
  escalatedAt: timestamp('escalated_at'),
  resolutionVerifiedStatus: text('resolution_verified_status').notNull().default('unverified'), // 'unverified' | 'confirmed' | 'reopened'
  isSampleDemo: boolean('is_sample_demo').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const complaintAssignments = pgTable('complaint_assignments', {
  id: serial('id').primaryKey(),
  complaintId: integer('complaint_id')
    .references(() => complaints.id)
    .notNull(),
  departmentCode: text('department_code').notNull(),
  assignedToUid: text('assigned_to_uid'),
  assignedToName: text('assigned_to_name').notNull(),
  assignedByName: text('assigned_by_name').notNull(),
  routingType: text('routing_type').notNull(), // 'smart_auto' | 'manual_override' | 'officer_claim'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const statusHistory = pgTable('status_history', {
  id: serial('id').primaryKey(),
  complaintId: integer('complaint_id')
    .references(() => complaints.id)
    .notNull(),
  previousStatus: text('previous_status'),
  newStatus: text('new_status').notNull(),
  actorRole: text('actor_role').notNull(), // 'citizen' | 'system' | 'officer' | 'admin'
  actorName: text('actor_name').notNull(),
  comment: text('comment').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  complaintId: integer('complaint_id')
    .references(() => complaints.id)
    .notNull(),
  channel: text('channel').notNull(),
  recipientMasked: text('recipient_masked').notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  deliveryState: text('delivery_state').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const resolutionFeedback = pgTable('resolution_feedback', {
  id: serial('id').primaryKey(),
  complaintId: integer('complaint_id')
    .references(() => complaints.id)
    .notNull(),
  outcome: text('outcome').notNull(), // 'confirmed' | 'reopened'
  rating: integer('rating'),
  citizenComment: text('citizen_comment').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const uploadedEvidence = pgTable('uploaded_evidence', {
  id: serial('id').primaryKey(),
  complaintId: integer('complaint_id')
    .references(() => complaints.id)
    .notNull(),
  stage: text('stage').notNull(), // 'submission_before' | 'resolution_after' | 'reopen_proof'
  mimeType: text('mime_type').notNull(),
  imageUrl: text('image_url').notNull(),
  caption: text('caption'),
  uploadedByRole: text('uploaded_by_role').notNull(), // 'citizen' | 'officer'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const complaintsRelations = relations(complaints, ({ many }) => ({
  assignments: many(complaintAssignments),
  history: many(statusHistory),
  notifications: many(notifications),
  feedback: many(resolutionFeedback),
  evidence: many(uploadedEvidence),
}));

export const complaintAssignmentsRelations = relations(complaintAssignments, ({ one }) => ({
  complaint: one(complaints, {
    fields: [complaintAssignments.complaintId],
    references: [complaints.id],
  }),
}));

export const statusHistoryRelations = relations(statusHistory, ({ one }) => ({
  complaint: one(complaints, {
    fields: [statusHistory.complaintId],
    references: [complaints.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  complaint: one(complaints, {
    fields: [notifications.complaintId],
    references: [complaints.id],
  }),
}));

export const resolutionFeedbackRelations = relations(resolutionFeedback, ({ one }) => ({
  complaint: one(complaints, {
    fields: [resolutionFeedback.complaintId],
    references: [complaints.id],
  }),
}));

export const uploadedEvidenceRelations = relations(uploadedEvidence, ({ one }) => ({
  complaint: one(complaints, {
    fields: [uploadedEvidence.complaintId],
    references: [complaints.id],
  }),
}));
