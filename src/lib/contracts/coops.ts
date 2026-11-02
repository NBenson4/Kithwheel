// Shared zod contracts for co-op scheduling data.
import { z } from 'zod';

export const CoopRecord = z.object({
  id: z.string(),
  name: z.string(),
});

export const CoopList = z.object({ items: z.array(CoopRecord) });

export const CoopCreate = z.object({
  name: z.string().trim().min(1, 'Co-op name is required').max(120, 'Co-op name is too long'),
});

export const CoopClassRecord = z.object({
  id: z.string(),
  coopId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  teacher: z.string().nullable(),
  room: z.string().nullable(),
  time: z.string().nullable(),
});

export const CoopClassList = z.object({ items: z.array(CoopClassRecord) });

export const CoopClassCreate = z.object({
  name: z.string().trim().min(1, 'Class name is required').max(120, 'Class name is too long'),
  description: z.string().trim().max(500, 'Description is too long').optional(),
  teacher: z.string().trim().max(120, 'Teacher name is too long').optional(),
  room: z.string().trim().max(120, 'Room is too long').optional(),
  time: z.string().trim().max(120, 'Time is too long').optional(),
});

export const CoopClassUpdate = CoopClassCreate.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one class field to update',
);

export const RotationInput = z.object({
  ageGroup: z.string().trim().min(1, 'Age group is required').max(80, 'Age group is too long'),
  classIds: z.array(z.string().min(1)).max(100),
});

export const ScheduleStatus = z.enum(['draft', 'published', 'withdrawn', 'archived']);

export const ScheduleEntry = z.object({
  id: z.string(),
  position: z.number().int().nonnegative(),
  class: CoopClassRecord.pick({
    id: true,
    name: true,
    description: true,
    teacher: true,
    room: true,
    time: true,
  }),
});

export const ScheduleRotation = z.object({
  id: z.string(),
  ageGroup: z.string(),
  position: z.number().int().nonnegative(),
  entries: z.array(ScheduleEntry),
});

export const ScheduleRecord = z.object({
  id: z.string(),
  coopId: z.string(),
  title: z.string(),
  status: ScheduleStatus,
  publishedAt: z.string().nullable(),
  withdrawnAt: z.string().nullable(),
  rotations: z.array(ScheduleRotation),
});

export const ScheduleList = z.object({
  items: z.array(ScheduleRecord),
  currentScheduleId: z.string().nullable(),
});

export const ScheduleCreate = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Schedule name is required')
    .max(120, 'Schedule name is too long'),
});

export const ScheduleUpdate = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Schedule name is required')
      .max(120, 'Schedule name is too long')
      .optional(),
    rotations: z.array(RotationInput).max(30).optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.rotations !== undefined,
    'No schedule changes were provided',
  );

export const BillingStatus = z.object({
  state: z.enum(['trial', 'trial_expired', 'subscribed', 'past_due', 'inactive']),
  canEdit: z.boolean(),
  trialEndsAt: z.string(),
  trialDaysLeft: z.number().int().nonnegative(),
  plan: z.enum(['month', 'year']).nullable(),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  /** Whether the co-op has a Stripe customer, so the billing portal can open. */
  hasBillingAccount: z.boolean(),
  /** False when Stripe is not configured on this deployment. */
  billingAvailable: z.boolean(),
});

export const CheckoutStart = z.object({ interval: z.enum(['month', 'year']) });

export const RedirectUrl = z.object({ url: z.string().url() });

export type CoopRecord = z.infer<typeof CoopRecord>;
export type BillingStatus = z.infer<typeof BillingStatus>;
export type CoopClassRecord = z.infer<typeof CoopClassRecord>;
export type ScheduleRecord = z.infer<typeof ScheduleRecord>;
export type ScheduleRotationInput = z.infer<typeof RotationInput>;
