import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").max(100),
  projectRoles: z.array(z.string()).default([]),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const mfaVerifySchema = z.object({
  code: z.string().length(6, "Code must be 6 digits").regex(/^\d+$/, "Code must be numeric"),
});

export const domainSchema = z.object({
  domain: z.string()
    .min(3, "Domain too short")
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i, "Invalid domain format")
    .transform((d) => d.toLowerCase()),
});

export const updateRolesSchema = z.object({
  roles: z.array(z.enum(["IC", "PM", "AC", "BUL", "AA"]))
    .min(1, "User must have at least one role"),
  financialAccess: z.boolean().optional(),
  managedAccountIds: z.array(z.string().uuid()).optional(),
  primaryBuId: z.string().uuid().optional(),
});

export const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  buId: z.string().uuid("Invalid business unit ID"),
  name: z.string().min(1).max(120).optional(),
  projectRole: z.string().min(1).max(100).optional(),
});

export const acceptInviteSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  password: z
    .string()
    // 8-char minimum to match the registration path (validation.ts:5) and
    // the signed-off test cases (TC 1.16/1.17). Previously this path alone
    // required 12, an internal inconsistency: a direct signup needed 8 but
    // an invited user needed 12. If a stronger policy is wanted, bump BOTH
    // schemas to 12 and update the test-case doc's "8 characters" references.
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password too long"),
});

// ═══════════════════════════════════════════════════════════════
// DROP 3 — Projects, Assignments, Hours
// ═══════════════════════════════════════════════════════════════

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const wizardAssignmentSchema = z.object({
  userId: z.string().uuid(),
  projectRole: z.string().min(1).max(100),
  billRate: z.number().min(0).max(10_000),
  costRate: z.number().min(0).max(10_000),
});

const wizardPlannedHourSchema = z.object({
  userId: z.string().uuid(),
  projectWeek: z.number().int().min(0).max(520),
  plannedHours: z.number().min(0).max(168),
});

export const createProjectSchema = z
  .object({
    name: z.string().min(1).max(200),
    accountId: z.string().uuid(),
    owningBuId: z.string().uuid(),
    projectCode: z
      .string()
      .min(1)
      .max(50)
      .regex(/^[A-Z0-9-]+$/, "Project code: uppercase letters, digits, hyphens"),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    contingencyPct: z.number().min(0).max(1).default(0.15),
    description: z.string().max(2000).optional(),
    assignments: z.array(wizardAssignmentSchema).min(1, "At least one resource is required"),
    plannedHours: z.array(wizardPlannedHourSchema).default([]),
  })
  .refine((d) => new Date(d.startDate) <= new Date(d.endDate), {
    message: "End date must be on or after start date",
    path: ["endDate"],
  })
  .refine(
    (d) => {
      const ids = d.assignments.map((a) => a.userId);
      return new Set(ids).size === ids.length;
    },
    { message: "Duplicate userId in assignments", path: ["assignments"] }
  );

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  contingencyPct: z.number().min(0).max(1).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(["active", "on_hold", "complete", "archived"]).optional(),
});

export const createAssignmentSchema = z.object({
  userId: z.string().uuid(),
  projectRole: z.string().min(1).max(100),
  billRate: z.number().min(0).max(10_000),
  costRate: z.number().min(0).max(10_000),
});

export const updateAssignmentSchema = z.object({
  projectRole: z.string().min(1).max(100).optional(),
  billRate: z.number().min(0).max(10_000).optional(),
  costRate: z.number().min(0).max(10_000).optional(),
});

export const hoursBatchSchema = z.object({
  updates: z
    .array(
      z.object({
        assignmentId: z.string().uuid(),
        projectWeek: z.number().int().min(0).max(520),
        plannedHours: z.number().min(0).max(168).nullable().optional(),
        actualHours: z.number().min(0).max(168).nullable().optional(),
      })
    )
    .min(1, "At least one update required")
    .max(500, "Batch too large (max 500 entries)"),
});

export const unlockWeekSchema = z.object({
  reason: z.string().max(500).optional(),
});
