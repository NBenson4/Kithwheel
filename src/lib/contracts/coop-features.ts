// Shared zod contracts for families, registration, announcements, volunteer hours,
// fees, co-coordinators, and the family-facing pages.
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2027-01-15');
const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} is too long`).optional();

export const TIME_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
] as const;

// ── Settings ────────────────────────────────────────────────────────────────

export const CoopSettings = z.object({
  shareUrl: z.string().nullable(),
  kioskUrl: z.string().nullable(),
  registrationOpen: z.boolean(),
  autoPlace: z.boolean(),
  registrationNote: z.string().nullable(),
  timeZone: z.string(),
  meetingDay: z.number().int().min(0).max(6).nullable(),
  termStart: isoDate.nullable(),
  termEnd: isoDate.nullable(),
  familyFeeCents: z.number().int(),
  childFeeCents: z.number().int(),
  paymentInstructions: z.string().nullable(),
  volunteerMinutesRequired: z.number().int().nullable(),
  hasCurrentSchedule: z.boolean(),
  counts: z.object({
    classes: z.number().int(),
    classFees: z.number().int(),
    families: z.number().int(),
    coordinators: z.number().int(),
    pendingInvites: z.number().int(),
  }),
});

export const CoopSettingsUpdate = z
  .object({
    registrationOpen: z.boolean(),
    autoPlace: z.boolean(),
    registrationNote: z.string().trim().max(1000, 'Note is too long').nullable(),
    timeZone: z.enum(TIME_ZONES),
    meetingDay: z.number().int().min(0).max(6).nullable(),
    termStart: isoDate.nullable(),
    termEnd: isoDate.nullable(),
    familyFeeCents: z.number().int().min(0).max(10_000_000),
    childFeeCents: z.number().int().min(0).max(10_000_000),
    paymentInstructions: z.string().trim().max(1000, 'Instructions are too long').nullable(),
    volunteerMinutesRequired: z
      .number()
      .int()
      .min(0)
      .max(1000 * 60)
      .nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No changes were provided')
  .refine(
    (value) => !value.termStart || !value.termEnd || value.termStart <= value.termEnd,
    'The term has to end after it starts',
  );

export const ShareLink = z.object({ shareUrl: z.string() });
export const KioskLink = z.object({ kioskUrl: z.string() });

// ── Team ────────────────────────────────────────────────────────────────────

export const TeamMember = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  isCreator: z.boolean(),
  isYou: z.boolean(),
});

export const PendingInvite = z.object({
  id: z.string(),
  email: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
});

export const Team = z.object({ members: z.array(TeamMember), invites: z.array(PendingInvite) });

export const InviteCreate = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200),
});

export const InviteInfo = z.object({
  coopName: z.string(),
  email: z.string(),
  invitedBy: z.string(),
  status: z.enum(['valid', 'expired', 'accepted']),
});

export const InviteAccepted = z.object({ coopId: z.string() });

// ── Classes (import) ────────────────────────────────────────────────────────

export const ImportedClassInput = z.object({
  name: z.string().trim().min(1, 'Class name is required').max(120, 'Class name is too long'),
  description: optionalText(500, 'Description'),
  teacher: optionalText(120, 'Teacher name'),
  room: optionalText(120, 'Room'),
  time: optionalText(120, 'Time'),
  capacity: z.number().int().min(1).max(1000).nullable().optional(),
  feeCents: z.number().int().min(0).max(10_000_000).optional(),
  materials: optionalText(1000, 'Materials list'),
});

export const ClassImport = z.object({ classes: z.array(ImportedClassInput).min(1).max(200) });
export const ImportResult = z.object({ created: z.number().int() });

// ── Families ────────────────────────────────────────────────────────────────

export const EnrollmentStatus = z.enum(['enrolled', 'waitlisted']);

export const BalanceLine = z.object({ label: z.string(), amountCents: z.number().int() });
export const Balance = z.object({
  lines: z.array(BalanceLine),
  totalCents: z.number().int(),
  paidCents: z.number().int(),
  balanceCents: z.number().int(),
});

export const VolunteerStatus = z.enum(['pending', 'approved', 'declined']);
export const VolunteerLog = z.object({
  id: z.string(),
  date: isoDate,
  minutes: z.number().int(),
  description: z.string(),
  status: VolunteerStatus,
  addedByCoordinator: z.boolean(),
});

export const FamilyRecord = z.object({
  id: z.string(),
  parentName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  notes: z.string().nullable(),
  familyUrl: z.string(),
  createdAt: z.string(),
  children: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      ageGroup: z.string().nullable(),
      enrollments: z.array(
        z.object({
          id: z.string(),
          classId: z.string(),
          className: z.string(),
          status: EnrollmentStatus,
        }),
      ),
    }),
  ),
  balance: Balance,
  charges: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      amountCents: z.number().int(),
      createdAt: z.string(),
    }),
  ),
  payments: z.array(
    z.object({
      id: z.string(),
      amountCents: z.number().int(),
      method: z.string(),
      note: z.string().nullable(),
      paidOn: isoDate,
    }),
  ),
  volunteer: z.object({
    approvedMinutes: z.number().int(),
    pendingMinutes: z.number().int(),
    logs: z.array(VolunteerLog),
  }),
});

export const ClassRoster = z.object({
  id: z.string(),
  name: z.string(),
  capacity: z.number().int().nullable(),
  feeCents: z.number().int(),
  enrolled: z.number().int(),
  waitlisted: z.number().int(),
  roster: z.array(
    z.object({
      enrollmentId: z.string(),
      childName: z.string(),
      familyId: z.string(),
      familyName: z.string(),
      status: EnrollmentStatus,
    }),
  ),
});

export const FamilyOverview = z.object({
  families: z.array(FamilyRecord),
  classes: z.array(ClassRoster),
  volunteerMinutesRequired: z.number().int().nullable(),
});

export const ChildInput = z.object({
  name: z.string().trim().min(1, 'Each child needs a name').max(120, 'Name is too long'),
  ageGroup: z.string().trim().max(80).optional(),
  /** Only coordinators choose classes; families' choices are ignored. */
  classIds: z.array(z.string().min(1).max(60)).max(40).default([]),
});

export const FamilyCreate = z.object({
  parentName: z
    .string()
    .trim()
    .min(1, 'Parent or guardian name is required')
    .max(120, 'Name is too long'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200),
  phone: optionalText(40, 'Phone'),
  children: z.array(ChildInput).min(1, 'Add at least one child').max(12),
  /** Honeypot: real people leave it empty. */
  website: z.string().max(200).optional(),
  /** Coordinator-added families only: email the family their link. */
  sendEmail: z.boolean().optional(),
});

export const FamilyUpdate = z
  .object({
    parentName: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200),
    phone: z.string().trim().max(40, 'Phone is too long').nullable(),
    notes: z.string().trim().max(2000, 'Notes are too long').nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No changes were provided');

export const EnrollmentAdd = z.object({ childId: z.string().min(1), classId: z.string().min(1) });

/** The exact set of children who should be enrolled in one class. */
export const RosterSet = z.object({ childIds: z.array(z.string().min(1).max(60)).max(1000) });

export const ChildUpdate = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
    ageGroup: z.string().trim().max(80).nullable(),
    /** When the age group changes, swap the old group's classes for the new group's. */
    movePlacements: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No changes were provided');

export const AutoPlaceResult = z.object({ placed: z.number().int(), waitlisted: z.number().int() });

export const RegistrationResult = z.object({
  status: z.enum(['registered', 'already_registered']),
  enrolled: z.array(z.object({ childName: z.string(), className: z.string() })),
  waitlisted: z.array(z.object({ childName: z.string(), className: z.string() })),
});

// ── Fees ────────────────────────────────────────────────────────────────────

export const ChargeCreate = z.object({
  description: z.string().trim().min(1, 'Describe the charge').max(200, 'Too long'),
  amountCents: z
    .number()
    .int()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((value) => value !== 0, 'Enter an amount'),
});

export const PaymentCreate = z.object({
  amountCents: z.number().int().min(1, 'Enter an amount').max(10_000_000),
  method: z.string().trim().min(1, 'How was it paid?').max(60, 'Too long'),
  note: optionalText(200, 'Note'),
  paidOn: isoDate,
});

// ── Volunteer hours ─────────────────────────────────────────────────────────

export const VolunteerCreate = z.object({
  date: isoDate,
  minutes: z
    .number()
    .int()
    .min(1, 'Enter the hours')
    .max(24 * 60, 'That is more than a day'),
  description: z
    .string()
    .trim()
    .min(1, 'Say what the time was for')
    .max(300, 'Description is too long'),
});

export const CoordinatorVolunteerCreate = VolunteerCreate.extend({ familyId: z.string().min(1) });

export const VolunteerReview = z.object({ status: VolunteerStatus });

// ── Announcements ───────────────────────────────────────────────────────────

export const Announcement = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  classId: z.string().nullable(),
  className: z.string().nullable(),
  recipientCount: z.number().int(),
  createdAt: z.string(),
});

export const AnnouncementList = z.object({ items: z.array(Announcement) });

export const AnnouncementCreate = z.object({
  title: z.string().trim().min(1, 'Add a subject').max(150, 'Subject is too long'),
  body: z.string().trim().min(1, 'Write the announcement').max(5000, 'Message is too long'),
  classId: z.string().min(1).nullable().optional(),
});

// ── Family-facing pages ─────────────────────────────────────────────────────

export const PublicClass = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  teacher: z.string().nullable(),
  room: z.string().nullable(),
  time: z.string().nullable(),
  materials: z.string().nullable(),
  feeCents: z.number().int(),
  capacity: z.number().int().nullable(),
  seatsLeft: z.number().int().nullable(),
  waitlisted: z.number().int(),
});

export const PublicSchedule = z.object({
  title: z.string(),
  rotations: z.array(z.object({ ageGroup: z.string(), classes: z.array(PublicClass) })),
});

export const PublicCoop = z.object({
  name: z.string(),
  schedule: PublicSchedule.nullable(),
  registration: z.object({ open: z.boolean(), note: z.string().nullable() }),
  fees: z.object({ familyFeeCents: z.number().int(), childFeeCents: z.number().int() }),
  meetingDay: z.number().int().nullable(),
  calendarUrl: z.string().nullable(),
});

export const FamilyHome = z.object({
  coopName: z.string(),
  parentName: z.string(),
  email: z.string(),
  children: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      ageGroup: z.string().nullable(),
      enrollments: z.array(
        z.object({
          id: z.string(),
          classId: z.string(),
          status: EnrollmentStatus,
          waitlistPosition: z.number().int().nullable(),
          class: PublicClass,
        }),
      ),
    }),
  ),
  schedule: PublicSchedule.nullable(),
  registrationOpen: z.boolean(),
  announcements: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      body: z.string(),
      className: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  fees: Balance.extend({
    payments: z.array(
      z.object({ amountCents: z.number().int(), method: z.string(), paidOn: isoDate }),
    ),
    paymentInstructions: z.string().nullable(),
  }),
  volunteer: z.object({
    requiredMinutes: z.number().int().nullable(),
    approvedMinutes: z.number().int(),
    pendingMinutes: z.number().int(),
    logs: z.array(VolunteerLog),
  }),
  calendarUrl: z.string().nullable(),
  attendance: z.object({
    present: z.number().int(),
    absent: z.number().int(),
    recent: z.array(
      z.object({ date: isoDate, childName: z.string(), status: z.enum(['present', 'absent']) }),
    ),
  }),
});

// ── Attendance ──────────────────────────────────────────────────────────────

export const AttendanceStatus = z.enum(['present', 'absent']);

export const AttendanceDay = z.object({
  date: isoDate,
  today: isoDate,
  children: z.array(
    z.object({
      childId: z.string(),
      childName: z.string(),
      familyId: z.string(),
      familyName: z.string(),
      ageGroup: z.string().nullable(),
      status: AttendanceStatus.nullable(),
      checkedInAt: z.string().nullable(),
      checkedOutAt: z.string().nullable(),
      source: z.string().nullable(),
    }),
  ),
});

export const AttendanceMark = z.object({
  childId: z.string().min(1),
  date: isoDate,
  action: z.enum(['check_in', 'check_out', 'absent', 'clear']),
});

export const AttendanceHistory = z.object({
  days: z.array(z.object({ date: isoDate, present: z.number().int(), absent: z.number().int() })),
  children: z.array(
    z.object({
      childId: z.string(),
      childName: z.string(),
      familyName: z.string(),
      present: z.number().int(),
      absent: z.number().int(),
    }),
  ),
});

export const KioskDay = z.object({
  coopName: z.string(),
  date: isoDate,
  children: z.array(
    z.object({
      childId: z.string(),
      name: z.string(),
      familyName: z.string(),
      ageGroup: z.string().nullable(),
      checkedInAt: z.string().nullable(),
      checkedOutAt: z.string().nullable(),
    }),
  ),
});

export const KioskMark = z.object({
  childId: z.string().min(1),
  action: z.enum(['check_in', 'check_out', 'undo']),
});

export type AttendanceDay = z.infer<typeof AttendanceDay>;
export type AttendanceHistory = z.infer<typeof AttendanceHistory>;
export type KioskDay = z.infer<typeof KioskDay>;
export type CoopSettings = z.infer<typeof CoopSettings>;
export type Team = z.infer<typeof Team>;
export type FamilyRecord = z.infer<typeof FamilyRecord>;
export type ClassRoster = z.infer<typeof ClassRoster>;
export type FamilyOverview = z.infer<typeof FamilyOverview>;
export type Announcement = z.infer<typeof Announcement>;
export type PublicCoop = z.infer<typeof PublicCoop>;
export type PublicClass = z.infer<typeof PublicClass>;
export type PublicSchedule = z.infer<typeof PublicSchedule>;
export type FamilyHome = z.infer<typeof FamilyHome>;
export type FamilyCreate = z.infer<typeof FamilyCreate>;
