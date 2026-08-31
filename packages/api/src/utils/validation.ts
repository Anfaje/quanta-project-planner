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
  roles: z.array(z.enum(["IC", "PM", "AC", "BUL", "AA"])).min(1, "Select at least one role").optional(),
});

// Self-service account edits (PATCH /api/me). Deliberately limited to safe
// fields — a user can set their display name and preferred project-role
// labels, but NOT their system roles, financial access, or BU.
export const updateMeSchema = z.object({
  name: z.string().min(1, "Name is required").max(120).optional(),
  projectRoles: z.array(z.string().min(1).max(60)).max(20).optional(),
});

// Change own password (POST /api/me/change-password): verify the current
// password, then set a new one held to the same 8-char minimum as signup.
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(100),
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
  billRate: z.number().min(0).max(10_000).optional(), // required for T&M (enforced on the project), omitted for fixed-price
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
    pricingModel: z.enum(["time_and_materials", "fixed_price"]).default("time_and_materials"),
    currency: z.enum(["USD", "GBP", "DKK", "EUR", "CHF", "CAD"]).default("USD"),
    fixedPrice: z.number().min(0).max(1_000_000_000).nullable().optional(),
    description: z.string().max(2000).optional(),
    assignments: z.array(wizardAssignmentSchema).min(1, "At least one resource is required"),
    plannedHours: z.array(wizardPlannedHourSchema).default([]),
    saveAsDraft: z.boolean().optional().default(false),
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
  )
  .superRefine((d, ctx) => {
    if (d.pricingModel === "fixed_price") {
      // Fixed price: a positive contract value is required; per-hour bill rates
      // are irrelevant and ignored.
      if (d.fixedPrice == null || d.fixedPrice <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A fixed-price project needs a contract value greater than 0",
          path: ["fixedPrice"],
        });
      }
    } else {
      // Time & materials: every resource needs a bill rate; no contract value.
      if (d.fixedPrice != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "fixedPrice only applies to fixed-price projects",
          path: ["fixedPrice"],
        });
      }
      d.assignments.forEach((a, i) => {
        if (a.billRate == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A bill rate is required for each resource on a time & materials project",
            path: ["assignments", i, "billRate"],
          });
        }
      });
    }
  });

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  contingencyPct: z.number().min(0).max(1).optional(),
  fixedPrice: z.number().min(0).max(1_000_000_000).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(["active", "on_hold", "complete", "archived"]).optional(),
});

// Draft workflow ---------------------------------------------------------
export const addReviewersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1, "At least one user required").max(50),
});

export const rejectDraftSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export const createAssignmentSchema = z.object({
  userId: z.string().uuid(),
  projectRole: z.string().min(1).max(100),
  billRate: z.number().min(0).max(10_000).optional(),
  costRate: z.number().min(0).max(10_000),
});

export const updateAssignmentSchema = z.object({
  projectRole: z.string().min(1).max(100).optional(),
  billRate: z.number().min(0).max(10_000).optional(),
  costRate: z.number().min(0).max(10_000).optional(),
});

// Standing per-person cost rate (loaded salary + overhead). null clears it.
export const updateCostRateSchema = z.object({
  costRate: z.number().min(0).max(100_000).nullable(),
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

// CSV bulk import of actual hours (TC 3.17/3.18). The client reads the file
// and posts its text; we cap the payload so a giant paste can't exhaust
// memory. Parsing + name-matching happens in the route.
export const hoursImportSchema = z.object({
  csv: z.string().min(1, "CSV content is required").max(1_000_000, "CSV too large"),
});

// Share a project with another business unit (TC 4.10/5.22).
export const shareProjectSchema = z.object({
  buId: z.string().uuid(),
});

// Password reset (TC 1.5). Request takes just an email; the reset takes the
// token + a new password held to the same 8-char minimum as registration.
export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
});


// Permission grants (admin) --------------------------------------------
export const permissionGrantsSchema = z.object({
  grants: z
    .array(
      z.object({
        permission: z.enum([
          "view_financials",
          "view_bill_rates",
          "manage_projects",
          "approve_drafts",
          "manage_users",
        ]),
        scopeType: z.enum(["platform", "business_unit", "account", "project"]),
        scopeId: z.string().uuid().nullable().optional(),
      })
    )
    .max(500),
});
