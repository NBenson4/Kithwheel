// Shared zod contracts for co-ops, grade sections and their classes.
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
  sectionId: z.string().nullable(),
  position: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  teacher: z.string().nullable(),
  room: z.string().nullable(),
  time: z.string().nullable(),
  capacity: z.number().int().nullable(),
  feeCents: z.number().int(),
  materials: z.string().nullable(),
});

export const CoopClassList = z.object({ items: z.array(CoopClassRecord) });

export const DeletedRecord = z.object({ id: z.string() });

export const CoopClassCreate = z.object({
  sectionId: z.string().min(1, 'Choose a section'),
  name: z.string().trim().min(1, 'Class name is required').max(120, 'Class name is too long'),
  description: z.string().trim().max(500, 'Description is too long').optional(),
  teacher: z.string().trim().max(120, 'Teacher name is too long').optional(),
  room: z.string().trim().max(120, 'Room is too long').optional(),
  time: z.string().trim().max(120, 'Time is too long').optional(),
  capacity: z.number().int().min(1, 'Capacity must be at least 1').max(1000).nullable().optional(),
  feeCents: z.number().int().min(0, 'Fee can’t be negative').max(10_000_000).optional(),
  materials: z.string().trim().max(1000, 'Materials list is too long').optional(),
});

export const CoopClassUpdate = CoopClassCreate.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one class field to update',
);

export const SectionStatus = z.enum(['draft', 'approved']);

export const SectionRecord = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().int(),
  status: SectionStatus,
  approvedAt: z.string().nullable(),
  childCount: z.number().int(),
  classes: z.array(CoopClassRecord),
});

export const SectionList = z.object({
  items: z.array(SectionRecord),
  /** Classes not filed under a section (only from older data). */
  unfiledClasses: z.array(CoopClassRecord),
});

const sectionName = z
  .string()
  .trim()
  .min(1, 'Section name is required')
  .max(80, 'Section name is too long');

export const SectionCreate = z.object({ name: sectionName });

export const SectionUpdate = z
  .object({
    name: sectionName,
    status: SectionStatus,
    /** Move the section up (-1) or down (1) in the list. */
    move: z.union([z.literal(-1), z.literal(1)]),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No changes were provided');

/** Reorder a section's classes: every class id in the new order. */
export const ClassOrder = z.object({ classIds: z.array(z.string().min(1)).max(200) });

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
export type SectionRecord = z.infer<typeof SectionRecord>;
export type SectionList = z.infer<typeof SectionList>;
