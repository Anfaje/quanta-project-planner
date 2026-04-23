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
});
