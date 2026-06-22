import { Router, Request, Response } from "express";
import { Role, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import {
  canAccessProject,
  canActivateProject,
  canApproveDraft,
  canAccessDraft,
  canCreateProject,
  canEditHours,
  canLockWeeks,
  canManagePlan,
  canManageProject,
  canViewFinancials,
  isPlanLocked,
} from "../lib/permissions";
import {
  buildProjectAccessFilter,
  loadProjectContext,
} from "../services/projectAccess";
import {
  serializeForUser,
  serializeAssignment,
} from "../services/financialSerializer";
import { captureBaseline } from "../services/planBaseline";
import {
  computeAssignmentFinancials,
  computeProjectFinancials,
  computeBurn,
  countProjectWeeks,
  weekStartDate,
} from "../services/financialCalc";
import { logChanges } from "../services/auditLog";
import {
  createProjectSchema,
  updateProjectSchema,
  createAssignmentSchema,
  updateAssignmentSchema,
  hoursBatchSchema,
  hoursImportSchema,
  shareProjectSchema,
  unlockWeekSchema,
  addReviewersSchema,
  rejectDraftSchema,
} from "../utils/validation";

const router = Router();
router.use(requireAuth);

// ═══════════════════════════════════════════════════════════════
// PROJECT CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/projects
 * List projects the caller can see. Scoped by buildProjectAccessFilter.
 * Query params: ?status=active|on_hold|complete|archived (optional, repeatable)
 */
router.get("/", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const accessFilter = buildProjectAccessFilter(user);

  const statuses = ([] as string[]).concat((req.query.status as any) ?? []);
  // Drafts never appear in the main list — they have a dedicated endpoint
  // (GET /api/projects/drafts) with their own access rules. Strip "draft" from
  // any requested filter, and exclude it by default otherwise.
  const requested = statuses.filter((s) => s !== "draft");
  const statusFilter =
    requested.length > 0
      ? { status: { in: requested as any[] } }
      : { status: { not: "draft" as any } };

  const projects = await prisma.project.findMany({
    where: { AND: [accessFilter, statusFilter] },
    select: {
      id: true,
      name: true,
      projectCode: true,
      status: true,
      startDate: true,
      endDate: true,
      contingencyPct: true,
      accountId: true,
      owningBuId: true,
      account: { select: { id: true, name: true, code: true } },
      owningBu: { select: { id: true, code: true, name: true } },
      shares: { select: { sharedWithBuId: true } },
      _count: { select: { assignments: true } },
    },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });

  const rows = projects.map((p) => {
    const ctx = {
      projectId: p.id,
      projectAccountId: p.accountId,
      projectOwningBuId: p.owningBuId,
      projectSharedBuIds: p.shares.map((s) => s.sharedWithBuId),
    };
    return serializeForUser(
      {
        id: p.id,
        name: p.name,
        projectCode: p.projectCode,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        contingencyPct: Number(p.contingencyPct),
        account: p.account,
        owningBu: p.owningBu,
        resourceCount: p._count.assignments,
      },
      user,
      ctx
    );
  });

  res.json({ projects: rows });
});

/**
 * GET /api/projects/drafts
 * Draft projects visible to the caller: their own drafts, drafts shared with
 * them as a reviewer, plus (for approvers) drafts they have mandate over — any
 * draft for an AA, owning-BU drafts for a BUL. MUST be registered before the
 * "/:id" route so "drafts" isn't captured as an id.
 */
router.get("/drafts", async (req: Request, res: Response) => {
  const user = req.authUser!;

  const orClauses: Prisma.ProjectWhereInput[] = [
    { createdById: user.id },
    { reviewers: { some: { userId: user.id } } },
  ];
  if (user.roles.includes(Role.BUL)) {
    orClauses.push({ owningBuId: user.primaryBuId });
  }
  // AA sees every draft; everyone else is scoped by the OR-union above.
  const accessWhere: Prisma.ProjectWhereInput = user.roles.includes(Role.AA)
    ? {}
    : { OR: orClauses };

  const drafts = await prisma.project.findMany({
    where: { AND: [{ status: "draft" }, accessWhere] },
    select: {
      id: true,
      name: true,
      projectCode: true,
      status: true,
      startDate: true,
      endDate: true,
      createdById: true,
      rejectionNote: true,
      rejectionAt: true,
      account: { select: { id: true, name: true, code: true } },
      owningBu: { select: { id: true, code: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      reviewers: {
        select: { user: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { assignments: true } },
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  const rows = drafts.map((p) => ({
    id: p.id,
    name: p.name,
    projectCode: p.projectCode,
    status: p.status,
    startDate: p.startDate,
    endDate: p.endDate,
    account: p.account,
    owningBu: p.owningBu,
    createdBy: p.createdBy,
    reviewers: p.reviewers.map((r) => r.user),
    resourceCount: p._count.assignments,
    updatedAt: p.updatedAt,
    rejectionNote: p.rejectionNote,
    rejectionAt: p.rejectionAt,
    changesRequested: p.rejectionAt != null,
    isOwner: p.createdById === user.id,
    canApprove: canApproveDraft(user, { owningBuId: p.owningBu.id }),
  }));

  res.json({ drafts: rows });
});

/**
 * GET /api/projects/:id
 * Project detail with assignments + computed financials (scoped).
 */
router.get("/:id", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });

  if (ctx.status === "draft") {
    // Drafts use their own access rules (owner / reviewer / AA / owning-BU BUL),
    // not the assignment-based path. Load the bits canAccessDraft needs.
    const meta = await prisma.project.findUnique({
      where: { id: ctx.id },
      select: { createdById: true, reviewers: { select: { userId: true } } },
    });
    const reviewerUserIds = meta?.reviewers.map((r) => r.userId) ?? [];
    if (
      !meta ||
      !canAccessDraft(user, {
        owningBuId: ctx.owningBuId,
        createdById: meta.createdById,
        reviewerUserIds,
      })
    ) {
      return res.status(403).json({ error: "No access to this draft" });
    }
  } else if (
    !canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds })
  ) {
    return res.status(403).json({ error: "No access to this project" });
  }

  const project = await prisma.project.findUnique({
    where: { id: ctx.id },
    include: {
      account: { select: { id: true, name: true, code: true } },
      owningBu: { select: { id: true, code: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      shares: {
        include: { sharedWithBu: { select: { id: true, code: true, name: true } } },
      },
      reviewers: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      assignments: {
        include: {
          user: { select: { id: true, name: true, email: true, primaryBuId: true } },
          hourEntries: true,
        },
      },
    },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });

  // IC sees only their own assignment row.
  const isICOnly =
    user.roles.includes(Role.IC) &&
    !user.roles.includes(Role.PM) &&
    !user.roles.includes(Role.AC) &&
    !user.roles.includes(Role.BUL) &&
    !user.roles.includes(Role.AA);
  const visibleAssignments = isICOnly
    ? project.assignments.filter((a) => a.userId === user.id)
    : project.assignments;

  const totalWeeks = countProjectWeeks(project.startDate, project.endDate);

  const assignmentRows = visibleAssignments.map((a) => {
    const fin = computeAssignmentFinancials({
      billRate: a.billRate,
      costRate: a.costRate,
      entries: a.hourEntries,
    });
    return serializeAssignment(
      {
        id: a.id,
        userId: a.userId,
        user: a.user,
        projectRole: a.projectRole,
        businessUnit: a.businessUnit,
        billRate: Number(a.billRate),
        costRate: Number(a.costRate),
        plannedHours: fin.plannedHours,
        actualHours: fin.actualHours,
        plannedFee: fin.plannedFee,
        actualFee: fin.actualFee,
        plannedCost: fin.plannedCost,
        actualCost: fin.actualCost,
      },
      user,
      ctx.ctx
    );
  });

  const projectFin = computeProjectFinancials(
    project.assignments.map((a) => ({
      billRate: a.billRate,
      costRate: a.costRate,
      entries: a.hourEntries,
    })),
    project.contingencyPct
  );

  const financials = serializeForUser(
    {
      totalPlannedHours: projectFin.totalPlannedHours,
      totalActualHours: projectFin.totalActualHours,
      totalFee: projectFin.totalFee,
      totalActualFee: projectFin.totalActualFee,
      totalCost: projectFin.totalCost,
      totalActualCost: projectFin.totalActualCost,
      contingencyAmt: projectFin.contingencyAmt,
      adjustedFee: projectFin.adjustedFee,
      marginPct: projectFin.marginPct,
      actualMarginPct: projectFin.actualMarginPct,
      eacHours: projectFin.eacHours,
    },
    user,
    ctx.ctx
  );

  const baseline = await prisma.planBaseline.findUnique({
    where: { projectId: project.id },
    select: { capturedAt: true },
  });

  res.json({
    project: {
      id: project.id,
      name: project.name,
      projectCode: project.projectCode,
      status: project.status,
      description: project.description,
      rejectionNote: project.rejectionNote,
      rejectionAt: project.rejectionAt,
      startDate: project.startDate,
      endDate: project.endDate,
      contingencyPct: Number(project.contingencyPct),
      totalWeeks,
      account: project.account,
      owningBu: project.owningBu,
      sharedWithBus: project.shares.map((s) => s.sharedWithBu),
      reviewers: project.reviewers.map((r) => r.user),
      createdBy: project.createdBy,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      baseline: baseline ? { capturedAt: baseline.capturedAt } : null,
    },
    assignments: assignmentRows,
    financials,
    capabilities: {
      canManage: canManageProject(user),
      canManagePlan: canManagePlan(user) && !isPlanLocked(project.status),
      canLockWeeks: canLockWeeks(user),
      isDraft: project.status === "draft",
      canApproveDraft:
        project.status === "draft" &&
        canApproveDraft(user, { owningBuId: project.owningBuId }),
      canManageReviewers:
        project.status === "draft" &&
        (project.createdById === user.id || user.roles.includes(Role.AA)),
    },
  });
});

/**
 * POST /api/projects
 * Wizard payload: atomically create project + assignments + planned-hour entries.
 */
router.post("/", async (req: Request, res: Response) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }
  const data = parsed.data;
  const user = req.authUser!;

  if (!canCreateProject(user, data.accountId, data.owningBuId)) {
    return res.status(403).json({ error: "Cannot create project in this account/BU" });
  }

  // A project can only reach `active` through an AA or the owning-BU BUL. They may
  // launch directly; everyone else (PM, AC) must save a draft for approval.
  if (!data.saveAsDraft && !canActivateProject(user, data.owningBuId)) {
    return res.status(403).json({
      error:
        "Only an AA or the owning-BU BUL can launch a project directly. Save it as a draft for approval.",
    });
  }

  // Verify references exist and are active.
  const [account, bu] = await Promise.all([
    prisma.account.findUnique({ where: { id: data.accountId } }),
    prisma.businessUnit.findUnique({ where: { id: data.owningBuId } }),
  ]);
  if (!account || !account.isActive) return res.status(400).json({ error: "Account not found or inactive" });
  if (!bu || !bu.isActive) return res.status(400).json({ error: "Business unit not found or inactive" });

  // Project code uniqueness
  const codeClash = await prisma.project.findUnique({ where: { projectCode: data.projectCode } });
  if (codeClash) return res.status(409).json({ error: "Project code already in use" });

  // Verify all assignment users exist + active
  const userIds = data.assignments.map((a) => a.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { id: true, primaryBu: { select: { code: true } } },
  });
  if (users.length !== userIds.length) {
    return res.status(400).json({ error: "One or more assigned users not found or inactive" });
  }
  const userBuMap = new Map(users.map((u) => [u.id, u.primaryBu?.code ?? ""]));

  const startDate = new Date(data.startDate + "T00:00:00Z");
  const endDate = new Date(data.endDate + "T00:00:00Z");
  const totalWeeks = countProjectWeeks(startDate, endDate);

  // Validate planned-hour entries reference in-range weeks + valid users.
  for (const ph of data.plannedHours) {
    if (ph.projectWeek >= totalWeeks) {
      return res
        .status(400)
        .json({ error: `plannedHours.projectWeek ${ph.projectWeek} out of range (0..${totalWeeks - 1})` });
    }
    if (!userIds.includes(ph.userId)) {
      return res
        .status(400)
        .json({ error: `plannedHours references userId not in assignments: ${ph.userId}` });
    }
  }

  // Build planned-hours lookup keyed by "userId|week"
  const plannedMap = new Map<string, number>();
  for (const ph of data.plannedHours) {
    plannedMap.set(`${ph.userId}|${ph.projectWeek}`, ph.plannedHours);
  }

  // Atomic create: project + assignments + pre-populated hour entries (all weeks).
  try {
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: data.name,
          accountId: data.accountId,
          owningBuId: data.owningBuId,
          projectCode: data.projectCode,
          startDate,
          endDate,
          contingencyPct: new Prisma.Decimal(data.contingencyPct),
          description: data.description,
          createdById: user.id,
          status: data.saveAsDraft ? "draft" : "active",
        },
      });

      for (const a of data.assignments) {
        const assignment = await tx.resourceAssignment.create({
          data: {
            projectId: project.id,
            userId: a.userId,
            projectRole: a.projectRole,
            billRate: new Prisma.Decimal(a.billRate),
            costRate: new Prisma.Decimal(a.costRate),
            businessUnit: userBuMap.get(a.userId) ?? "",
          },
        });

        // Pre-populate all weeks for this assignment.
        const entries = Array.from({ length: totalWeeks }, (_, w) => {
          const planned = plannedMap.get(`${a.userId}|${w}`);
          return {
            assignmentId: assignment.id,
            projectWeek: w,
            weekStartDate: weekStartDate(startDate, w),
            plannedHours: planned != null ? new Prisma.Decimal(planned) : null,
            actualHours: null,
            locked: false,
          };
        });
        if (entries.length > 0) {
          await tx.hourEntry.createMany({ data: entries });
        }
      }

      // A project launched directly (not saved as a draft) is active from the
      // start, so capture its Initial Plan baseline now, within the same tx.
      if (!data.saveAsDraft) {
        await captureBaseline(tx, project.id, user.id);
      }

      return project;
    });

    await logChanges("Project", result.id, user.id, [
      {
        field: "created",
        oldValue: null,
        newValue: JSON.stringify({ name: result.name, code: result.projectCode, status: result.status }),
      },
    ]);

    logger.info(
      { projectId: result.id, code: result.projectCode, status: result.status, actor: user.id },
      "Project created"
    );
    res.status(201).json({ projectId: result.id, projectCode: result.projectCode, status: result.status });
  } catch (err: any) {
    logger.error({ err }, "Failed to create project");
    res.status(500).json({ error: "Failed to create project" });
  }
});

// =====================================================================
// Draft workflow: reviewers (share), approve, reject
// =====================================================================

/**
 * POST /api/projects/:id/reviewers   { userIds: [...] }
 * Invite colleagues to review a draft. Owner-only (or AA). Draft-only.
 * Approval rights are NOT granted here — they come from role (canApproveDraft).
 */
router.post("/:id/reviewers", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const parsed = addReviewersSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, createdById: true },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (project.status !== "draft") {
    return res.status(409).json({ error: "Reviewers can only be added to draft projects" });
  }
  if (project.createdById !== user.id && !user.roles.includes(Role.AA)) {
    return res.status(403).json({ error: "Only the draft owner can manage reviewers" });
  }

  // Don't add the owner as their own reviewer; validate the rest exist + active.
  const userIds = [...new Set(parsed.data.userIds)].filter((id) => id !== project.createdById);
  if (userIds.length === 0) {
    return res.status(400).json({ error: "No valid reviewers to add" });
  }
  const found = await prisma.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { id: true },
  });
  if (found.length !== userIds.length) {
    return res.status(400).json({ error: "One or more users not found or inactive" });
  }

  await prisma.projectReviewer.createMany({
    data: userIds.map((uid) => ({ projectId: project.id, userId: uid, addedById: user.id })),
    skipDuplicates: true,
  });
  await logChanges("Project", project.id, user.id, [
    { field: "reviewers.added", oldValue: null, newValue: JSON.stringify(userIds) },
  ]);

  const reviewers = await prisma.projectReviewer.findMany({
    where: { projectId: project.id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json({ reviewers: reviewers.map((r) => r.user) });
});

/**
 * DELETE /api/projects/:id/reviewers/:userId
 * Remove a reviewer. Owner-only (or AA).
 */
router.delete("/:id/reviewers/:userId", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    select: { id: true, createdById: true },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (project.createdById !== user.id && !user.roles.includes(Role.AA)) {
    return res.status(403).json({ error: "Only the draft owner can manage reviewers" });
  }
  await prisma.projectReviewer.deleteMany({
    where: { projectId: project.id, userId: req.params.userId },
  });
  res.status(204).end();
});

/**
 * POST /api/projects/:id/approve
 * Flip a draft → active. AA or owning-BU BUL only; never the creator. Re-validates
 * references at approval time since they can drift while a draft sits.
 */
router.post("/:id/approve", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      status: true,
      owningBuId: true,
      createdById: true,
      projectCode: true,
      account: { select: { isActive: true } },
      owningBu: { select: { isActive: true } },
      assignments: { select: { user: { select: { isActive: true } } } },
    },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (project.status !== "draft") {
    return res.status(409).json({ error: "Only draft projects can be approved" });
  }
  if (!canApproveDraft(user, { owningBuId: project.owningBuId })) {
    return res.status(403).json({ error: "You do not have approval rights for this draft" });
  }

  // Re-validate: things may have changed since the draft was created.
  if (!project.account?.isActive) {
    return res.status(409).json({ error: "Account is inactive; cannot approve" });
  }
  if (!project.owningBu?.isActive) {
    return res.status(409).json({ error: "Owning business unit is inactive; cannot approve" });
  }
  if (project.assignments.some((a) => !a.user?.isActive)) {
    return res
      .status(409)
      .json({ error: "One or more assigned users are inactive; update the draft before approving" });
  }
  // Project code uniqueness is already enforced by the @unique constraint — the
  // code was reserved at draft-creation time, so no clash is possible here.

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: { status: "active", rejectionNote: null, rejectionAt: null },
  });

  // The draft is now active — capture its Initial Plan baseline (idempotent).
  await captureBaseline(prisma, project.id, user.id);

  await logChanges("Project", project.id, user.id, [
    { field: "status", oldValue: "draft", newValue: "active" },
    {
      field: "draft.approved",
      oldValue: null,
      newValue: JSON.stringify({ approver: user.id, code: project.projectCode }),
    },
  ]);
  logger.info({ projectId: project.id, approver: user.id }, "Draft approved -> active");
  res.json({ projectId: updated.id, status: updated.status });
});

/**
 * POST /api/projects/:id/reject   { reason? }
 * Decline a draft. AA or owning-BU BUL only; never the creator. The draft stays a
 * draft (the owner revises and it can be approved later); the reason is recorded
 * for the owner. Comments beyond this are handled offline (product decision).
 */
router.post("/:id/reject", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const parsed = rejectDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, owningBuId: true, createdById: true },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (project.status !== "draft") {
    return res.status(409).json({ error: "Only draft projects can be rejected" });
  }
  if (!canApproveDraft(user, { owningBuId: project.owningBuId })) {
    return res.status(403).json({ error: "You do not have approval rights for this draft" });
  }

  // Keep the draft; record the feedback so the owner sees what to change before
  // resubmitting. (Reject never deletes a draft.)
  await prisma.project.update({
    where: { id: project.id },
    data: { rejectionNote: parsed.data.reason ?? "Changes requested.", rejectionAt: new Date() },
  });

  await logChanges("Project", project.id, user.id, [
    {
      field: "draft.rejected",
      oldValue: null,
      newValue: JSON.stringify({ reviewer: user.id, reason: parsed.data.reason ?? null }),
    },
  ]);
  logger.info({ projectId: project.id, reviewer: user.id }, "Draft rejected (remains draft)");
  res.json({ projectId: project.id, status: "draft", rejected: true });
});

/**
 * POST /api/projects/:id/resubmit
 * Owner clears the "changes requested" feedback after revising, marking the draft
 * ready for review again. Owner-only, draft-only.
 */
router.post("/:id/resubmit", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, createdById: true },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (project.status !== "draft") {
    return res.status(409).json({ error: "Only draft projects can be resubmitted" });
  }
  if (project.createdById !== user.id) {
    return res.status(403).json({ error: "Only the draft owner can resubmit it" });
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { rejectionNote: null, rejectionAt: null },
  });
  await logChanges("Project", project.id, user.id, [
    { field: "draft.resubmitted", oldValue: null, newValue: null },
  ]);
  logger.info({ projectId: project.id, owner: user.id }, "Draft resubmitted for review");
  res.json({ projectId: project.id, status: "draft", resubmitted: true });
});

/**
 * PATCH /api/projects/:id
 * Update mutable fields on a project.
 */
router.patch("/:id", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });

  const isDraftOwner = ctx.status === "draft" && ctx.createdById === user.id;
  if (
    !isDraftOwner &&
    (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds }) ||
      !canManageProject(user))
  ) {
    return res.status(403).json({ error: "Cannot manage this project" });
  }

  if (ctx.status === "archived") {
    return res.status(409).json({ error: "Archived projects are read-only" });
  }

  // A completed project's plan is locked for evaluation. Allow a status-only
  // change (to reopen or archive), but block edits to the plan itself.
  if (ctx.status === "complete") {
    const onlyStatusChange =
      parsed.data.status !== undefined &&
      parsed.data.name === undefined &&
      parsed.data.description === undefined &&
      parsed.data.startDate === undefined &&
      parsed.data.endDate === undefined &&
      parsed.data.contingencyPct === undefined;
    if (!onlyStatusChange) {
      return res.status(409).json({
        error:
          "This project is complete; its plan is locked. Reopen it (set status to active) to make changes.",
      });
    }
  }

  // A draft's status is owned by the approval workflow. Block any status change
  // here so a draft can only reach `active` through approve (never a PM's PATCH).
  if (ctx.status === "draft" && parsed.data.status !== undefined) {
    return res.status(400).json({
      error: "A draft's status is set through approval — use approve / reject / resubmit.",
    });
  }

  const data = parsed.data;
  const updateData: Prisma.ProjectUpdateInput = {};
  const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];

  if (data.name !== undefined) {
    updateData.name = data.name;
    changes.push({ field: "name", oldValue: ctx.name, newValue: data.name });
  }
  if (data.description !== undefined) {
    updateData.description = data.description;
    changes.push({ field: "description", oldValue: null, newValue: data.description });
  }
  if (data.startDate !== undefined) {
    updateData.startDate = new Date(data.startDate + "T00:00:00Z");
    changes.push({
      field: "start_date",
      oldValue: ctx.startDate.toISOString().slice(0, 10),
      newValue: data.startDate,
    });
  }
  if (data.endDate !== undefined) {
    updateData.endDate = new Date(data.endDate + "T00:00:00Z");
    changes.push({
      field: "end_date",
      oldValue: ctx.endDate.toISOString().slice(0, 10),
      newValue: data.endDate,
    });
  }
  if (data.contingencyPct !== undefined) {
    updateData.contingencyPct = new Prisma.Decimal(data.contingencyPct);
    changes.push({
      field: "contingency_pct",
      oldValue: String(Number(ctx.contingencyPct)),
      newValue: String(data.contingencyPct),
    });
  }
  if (data.status !== undefined) {
    updateData.status = data.status;
    changes.push({ field: "status", oldValue: ctx.status, newValue: data.status });
  }

  if (changes.length === 0) {
    return res.json({ message: "No changes" });
  }

  await prisma.project.update({ where: { id: ctx.id }, data: updateData });
  await logChanges("Project", ctx.id, user.id, changes);

  logger.info({ projectId: ctx.id, actor: user.id, changes: changes.map((c) => c.field) }, "Project updated");
  res.json({ message: "Project updated", changes });
});

/**
 * POST /api/projects/:id/archive
 * Shortcut for status=archived with its own audit entry.
 */
router.post("/:id/archive", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });

  if (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds }) ||
      !canManageProject(user)) {
    return res.status(403).json({ error: "Cannot manage this project" });
  }
  if (ctx.status === "archived") {
    return res.status(409).json({ error: "Project already archived" });
  }

  await prisma.project.update({ where: { id: ctx.id }, data: { status: "archived" } });
  await logChanges("Project", ctx.id, user.id, [
    { field: "status", oldValue: ctx.status, newValue: "archived" },
  ]);

  res.json({ message: "Project archived" });
});

// ═══════════════════════════════════════════════════════════════
// PROJECT SHARING (cross-BU visibility) — TC 4.10 / 5.22
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/projects/:id/share  { buId }
 * Share a project with another business unit so that BU's leader can see it.
 * Idempotent — re-sharing the same BU is a no-op. Requires project-manage
 * rights + access to the project. Can't share a project with its own BU.
 */
router.post("/:id/share", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const parsed = shareProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });
  if (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds }) ||
      !canManageProject(user)) {
    return res.status(403).json({ error: "Cannot manage this project" });
  }
  if (ctx.status === "archived") return res.status(409).json({ error: "Project is archived" });

  const { buId } = parsed.data;
  if (buId === ctx.owningBuId) {
    return res.status(400).json({ error: "Project is already owned by that business unit" });
  }
  const bu = await prisma.businessUnit.findUnique({ where: { id: buId }, select: { id: true, isActive: true } });
  if (!bu) return res.status(404).json({ error: "Business unit not found" });
  if (!bu.isActive) return res.status(400).json({ error: "Business unit is inactive" });

  // Idempotent create.
  const existing = await prisma.projectShare.findUnique({
    where: { projectId_sharedWithBuId: { projectId: ctx.id, sharedWithBuId: buId } },
  });
  if (!existing) {
    await prisma.projectShare.create({ data: { projectId: ctx.id, sharedWithBuId: buId } });
    await logChanges("Project", ctx.id, user.id, [
      { field: "shared_with_bu", oldValue: null, newValue: buId },
    ]);
  }

  const shares = await prisma.projectShare.findMany({
    where: { projectId: ctx.id },
    select: { sharedWithBu: { select: { id: true, code: true, name: true } } },
  });
  res.json({ message: "Project shared", sharedWithBus: shares.map((s) => s.sharedWithBu) });
});

/**
 * DELETE /api/projects/:id/share/:buId
 * Stop sharing a project with a business unit. Idempotent.
 */
router.delete("/:id/share/:buId", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });
  if (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds }) ||
      !canManageProject(user)) {
    return res.status(403).json({ error: "Cannot manage this project" });
  }

  const existing = await prisma.projectShare.findUnique({
    where: { projectId_sharedWithBuId: { projectId: ctx.id, sharedWithBuId: req.params.buId } },
  });
  if (existing) {
    await prisma.projectShare.delete({ where: { id: existing.id } });
    await logChanges("Project", ctx.id, user.id, [
      { field: "shared_with_bu", oldValue: req.params.buId, newValue: null },
    ]);
  }

  const shares = await prisma.projectShare.findMany({
    where: { projectId: ctx.id },
    select: { sharedWithBu: { select: { id: true, code: true, name: true } } },
  });
  res.json({ message: "Share removed", sharedWithBus: shares.map((s) => s.sharedWithBu) });
});

/**
 * POST /api/projects/:id/assignments
 * Add a resource to the project. Pre-populates hour entries for all weeks.
 */
router.post("/:id/assignments", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const parsed = createAssignmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });

  const isDraftOwner = ctx.status === "draft" && ctx.createdById === user.id;
  if (
    !isDraftOwner &&
    (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds }) ||
      !canManageProject(user))
  ) {
    return res.status(403).json({ error: "Cannot manage this project" });
  }
  if (isPlanLocked(ctx.status)) return res.status(409).json({ error: ctx.status === "complete" ? "Project is complete; its plan is locked. Reopen it to make changes." : "Project is archived" });

  const data = parsed.data;

  const targetUser = await prisma.user.findUnique({
    where: { id: data.userId },
    include: { primaryBu: { select: { code: true } } },
  });
  if (!targetUser || !targetUser.isActive) {
    return res.status(400).json({ error: "User not found or inactive" });
  }

  const existing = await prisma.resourceAssignment.findUnique({
    where: { projectId_userId: { projectId: ctx.id, userId: data.userId } },
  });
  if (existing) return res.status(409).json({ error: "User already assigned to this project" });

  const totalWeeks = countProjectWeeks(ctx.startDate, ctx.endDate);

  const assignment = await prisma.$transaction(async (tx) => {
    const a = await tx.resourceAssignment.create({
      data: {
        projectId: ctx.id,
        userId: data.userId,
        projectRole: data.projectRole,
        billRate: new Prisma.Decimal(data.billRate),
        costRate: new Prisma.Decimal(data.costRate),
        businessUnit: targetUser.primaryBu?.code ?? "",
      },
    });
    if (totalWeeks > 0) {
      await tx.hourEntry.createMany({
        data: Array.from({ length: totalWeeks }, (_, w) => ({
          assignmentId: a.id,
          projectWeek: w,
          weekStartDate: weekStartDate(ctx.startDate, w),
          plannedHours: null,
          actualHours: null,
          locked: false,
        })),
      });
    }
    return a;
  });

  await logChanges("ResourceAssignment", assignment.id, user.id, [
    {
      field: "created",
      oldValue: null,
      newValue: JSON.stringify({
        projectId: ctx.id,
        userId: data.userId,
        projectRole: data.projectRole,
      }),
    },
  ]);

  logger.info({ assignmentId: assignment.id, projectId: ctx.id, actor: user.id }, "Assignment created");
  res.status(201).json({ assignmentId: assignment.id });
});

/**
 * PATCH /api/projects/:id/assignments/:assignmentId
 * Update role / bill rate / cost rate.
 */
router.patch("/:id/assignments/:assignmentId", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const parsed = updateAssignmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });

  const isDraftOwner = ctx.status === "draft" && ctx.createdById === user.id;
  if (
    !isDraftOwner &&
    (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds }) ||
      !canManageProject(user))
  ) {
    return res.status(403).json({ error: "Cannot manage this project" });
  }
  if (isPlanLocked(ctx.status)) return res.status(409).json({ error: ctx.status === "complete" ? "Project is complete; its plan is locked. Reopen it to make changes." : "Project is archived" });

  const existing = await prisma.resourceAssignment.findUnique({
    where: { id: req.params.assignmentId },
  });
  if (!existing || existing.projectId !== ctx.id) {
    return res.status(404).json({ error: "Assignment not found" });
  }

  const data = parsed.data;
  const updateData: Prisma.ResourceAssignmentUpdateInput = {};
  const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];

  if (data.projectRole !== undefined && data.projectRole !== existing.projectRole) {
    updateData.projectRole = data.projectRole;
    changes.push({ field: "project_role", oldValue: existing.projectRole, newValue: data.projectRole });
  }
  if (data.billRate !== undefined && Number(existing.billRate) !== data.billRate) {
    updateData.billRate = new Prisma.Decimal(data.billRate);
    changes.push({
      field: "bill_rate",
      oldValue: String(Number(existing.billRate)),
      newValue: String(data.billRate),
    });
  }
  if (data.costRate !== undefined && Number(existing.costRate) !== data.costRate) {
    updateData.costRate = new Prisma.Decimal(data.costRate);
    changes.push({
      field: "cost_rate",
      oldValue: String(Number(existing.costRate)),
      newValue: String(data.costRate),
    });
  }

  if (changes.length === 0) {
    return res.json({ message: "No changes" });
  }

  await prisma.resourceAssignment.update({ where: { id: existing.id }, data: updateData });
  await logChanges("ResourceAssignment", existing.id, user.id, changes);

  res.json({ message: "Assignment updated", changes });
});

/**
 * DELETE /api/projects/:id/assignments/:assignmentId
 * Remove a resource. Cascades to hour entries (via schema onDelete: Cascade).
 */
router.delete("/:id/assignments/:assignmentId", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });

  const isDraftOwner = ctx.status === "draft" && ctx.createdById === user.id;
  if (
    !isDraftOwner &&
    (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds }) ||
      !canManageProject(user))
  ) {
    return res.status(403).json({ error: "Cannot manage this project" });
  }
  if (isPlanLocked(ctx.status)) return res.status(409).json({ error: ctx.status === "complete" ? "Project is complete; its plan is locked. Reopen it to make changes." : "Project is archived" });

  const existing = await prisma.resourceAssignment.findUnique({
    where: { id: req.params.assignmentId },
  });
  if (!existing || existing.projectId !== ctx.id) {
    return res.status(404).json({ error: "Assignment not found" });
  }

  await prisma.resourceAssignment.delete({ where: { id: existing.id } });
  await logChanges("ResourceAssignment", existing.id, user.id, [
    { field: "deleted", oldValue: JSON.stringify({ userId: existing.userId }), newValue: null },
  ]);

  logger.info({ assignmentId: existing.id, projectId: ctx.id, actor: user.id }, "Assignment deleted");
  res.json({ message: "Assignment removed" });
});

// ═══════════════════════════════════════════════════════════════
// HOURS GRID
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/projects/:id/hours
 * Full grid for the project. IC sees only their own row.
 */
router.get("/:id/hours", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });

  if (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds })) {
    return res.status(403).json({ error: "No access to this project" });
  }

  const isICOnly =
    user.roles.includes(Role.IC) &&
    !user.roles.includes(Role.PM) &&
    !user.roles.includes(Role.AC) &&
    !user.roles.includes(Role.BUL) &&
    !user.roles.includes(Role.AA);

  const assignments = await prisma.resourceAssignment.findMany({
    where: {
      projectId: ctx.id,
      ...(isICOnly ? { userId: user.id } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      hourEntries: { orderBy: { projectWeek: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });

  const totalWeeks = countProjectWeeks(ctx.startDate, ctx.endDate);
  const weekStart = new Date(ctx.startDate);

  // Derive per-week lock state: a week is "locked" when all entries that exist
  // for that week are locked.
  const lockByWeek: Record<number, { locked: boolean; entries: number }> = {};
  for (const a of assignments) {
    for (const e of a.hourEntries) {
      const slot = lockByWeek[e.projectWeek] ?? { locked: true, entries: 0 };
      slot.entries += 1;
      if (!e.locked) slot.locked = false;
      lockByWeek[e.projectWeek] = slot;
    }
  }

  const weeks = Array.from({ length: totalWeeks }, (_, w) => ({
    week: w,
    weekStartDate: weekStartDate(weekStart, w).toISOString().slice(0, 10),
    locked: lockByWeek[w]?.entries > 0 ? lockByWeek[w].locked : false,
  }));

  const rows = assignments.map((a) =>
    serializeAssignment(
      {
        id: a.id,
        userId: a.userId,
        user: a.user,
        projectRole: a.projectRole,
        businessUnit: a.businessUnit,
        billRate: Number(a.billRate),
        costRate: Number(a.costRate),
        entries: a.hourEntries.map((e) => ({
          week: e.projectWeek,
          plannedHours: e.plannedHours != null ? Number(e.plannedHours) : null,
          actualHours: e.actualHours != null ? Number(e.actualHours) : null,
          locked: e.locked,
        })),
      },
      user,
      ctx.ctx
    )
  );

  res.json({
    projectId: ctx.id,
    totalWeeks,
    weeks,
    assignments: rows,
    capabilities: {
      canEditOwnActuals: user.roles.includes(Role.IC) && !isPlanLocked(ctx.status),
      canManagePlan: canManagePlan(user) && !isPlanLocked(ctx.status),
      canLockWeeks: canLockWeeks(user),
    },
  });
});

/**
 * PUT /api/projects/:id/hours
 * Batch update planned / actual hours.
 *
 * Per-update rules:
 *   - Entry must exist and belong to a non-locked week.
 *   - To change plannedHours: canManagePlan.
 *   - To change actualHours: canEditHours (IC restricted to own rows).
 *   - actualHours cannot be edited on locked entries.
 */
router.put("/:id/hours", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const parsed = hoursBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });

  const isDraftOwner = ctx.status === "draft" && ctx.createdById === user.id;
  if (!isDraftOwner && !canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds })) {
    return res.status(403).json({ error: "No access to this project" });
  }
  if (isPlanLocked(ctx.status)) return res.status(409).json({ error: ctx.status === "complete" ? "Project is complete; its plan is locked. Reopen it to make changes." : "Project is archived" });

  const assignmentIds = [...new Set(parsed.data.updates.map((u) => u.assignmentId))];
  const assignments = await prisma.resourceAssignment.findMany({
    where: { id: { in: assignmentIds }, projectId: ctx.id },
    select: { id: true, userId: true },
  });
  const assignmentMap = new Map(assignments.map((a) => [a.id, a]));

  // Reject if any assignmentId in the batch doesn't belong to this project.
  for (const u of parsed.data.updates) {
    if (!assignmentMap.has(u.assignmentId)) {
      return res.status(400).json({ error: `Assignment ${u.assignmentId} not found on this project` });
    }
  }

  // Pre-authorize every update.
  const canManagePlanHere = canManagePlan(user);
  for (const u of parsed.data.updates) {
    const a = assignmentMap.get(u.assignmentId)!;
    const isOwn = a.userId === user.id;

    if (u.plannedHours !== undefined && !canManagePlanHere) {
      return res.status(403).json({ error: "Cannot edit planned hours (need PM/AC/BUL role)" });
    }
    if (u.actualHours !== undefined && !canEditHours(user, isOwn)) {
      return res.status(403).json({ error: "Cannot edit actual hours for this row" });
    }
  }

  // Load existing entries to diff.
  const existingEntries = await prisma.hourEntry.findMany({
    where: {
      assignmentId: { in: assignmentIds },
      projectWeek: { in: parsed.data.updates.map((u) => u.projectWeek) },
    },
  });
  const entryMap = new Map(
    existingEntries.map((e) => [`${e.assignmentId}|${e.projectWeek}`, e])
  );

  const auditEntries: Array<{
    entityId: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }> = [];

  try {
    await prisma.$transaction(async (tx) => {
      for (const u of parsed.data.updates) {
        const key = `${u.assignmentId}|${u.projectWeek}`;
        const existing = entryMap.get(key);

        if (!existing) {
          throw new HttpError(
            404,
            `Entry not found for assignment ${u.assignmentId} week ${u.projectWeek}`
          );
        }
        if (existing.locked) {
          throw new HttpError(
            409,
            `Week ${u.projectWeek} is locked for assignment ${u.assignmentId}`
          );
        }

        const updateData: Prisma.HourEntryUpdateInput = {};

        if (u.plannedHours !== undefined) {
          const newVal = u.plannedHours == null ? null : new Prisma.Decimal(u.plannedHours);
          updateData.plannedHours = newVal;
          const oldStr = existing.plannedHours != null ? String(Number(existing.plannedHours)) : null;
          const newStr = u.plannedHours != null ? String(u.plannedHours) : null;
          if (oldStr !== newStr) {
            auditEntries.push({
              entityId: existing.id,
              field: "planned_hours",
              oldValue: oldStr,
              newValue: newStr,
            });
          }
        }
        if (u.actualHours !== undefined) {
          const newVal = u.actualHours == null ? null : new Prisma.Decimal(u.actualHours);
          updateData.actualHours = newVal;
          const oldStr = existing.actualHours != null ? String(Number(existing.actualHours)) : null;
          const newStr = u.actualHours != null ? String(u.actualHours) : null;
          if (oldStr !== newStr) {
            auditEntries.push({
              entityId: existing.id,
              field: "actual_hours",
              oldValue: oldStr,
              newValue: newStr,
            });
          }
        }

        if (Object.keys(updateData).length > 0) {
          await tx.hourEntry.update({ where: { id: existing.id }, data: updateData });
        }
      }
    });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    logger.error({ err }, "Hours batch update failed");
    return res.status(500).json({ error: "Failed to update hours" });
  }

  if (auditEntries.length > 0) {
    await prisma.auditLog.createMany({
      data: auditEntries.map((a) => ({
        entityType: "HourEntry",
        entityId: a.entityId,
        field: a.field,
        oldValue: a.oldValue,
        newValue: a.newValue,
        changedBy: user.id,
      })),
    });
  }

  res.json({
    message: "Hours updated",
    updatesApplied: parsed.data.updates.length,
    fieldsChanged: auditEntries.length,
  });
});

/**
 * POST /api/projects/:id/hours/import
 * Bulk-import actual hours from CSV (TC 3.17/3.18/8.6).
 *
 * Expected CSV: a header row whose first column is the resource (matched by
 * name or email, case-insensitive) and whose remaining columns are week
 * labels — "W1", "Week 1", or just "1" (1-based; mapped to 0-based
 * projectWeek). Each data row supplies that resource's actual hours per week:
 *
 *   Resource,W1,W2,W3,W4
 *   Maya Chen,8,8,7.5,8
 *   alex@trifork.com,40,40,40,40
 *
 * Behaviour:
 *   - Rows whose resource doesn't match a project assignment are skipped and
 *     reported in `unmatched` (TC 3.18). UTF-8 names match natively (TC 8.6).
 *   - Week columns outside the project range are ignored and reported.
 *   - Locked (assignment, week) cells are skipped and reported, not fatal.
 *   - Blank/non-numeric cells are left untouched.
 *
 * Importing writes ON BEHALF of the team, so it requires the plan-management
 * capability (PM/AC/BUL). ICs get 403.
 */
router.post("/:id/hours/import", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const parsed = hoursImportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });
  if (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds })) {
    return res.status(403).json({ error: "No access to this project" });
  }
  if (!canManagePlan(user)) {
    return res.status(403).json({ error: "Importing hours requires a PM, AC, or BUL role" });
  }
  if (isPlanLocked(ctx.status)) return res.status(409).json({ error: ctx.status === "complete" ? "Project is complete; its plan is locked. Reopen it to make changes." : "Project is archived" });

  const rows = parseCsv(parsed.data.csv);
  if (rows.length < 2) {
    return res.status(400).json({ error: "CSV needs a header row and at least one data row" });
  }

  const totalWeeks = countProjectWeeks(ctx.startDate, ctx.endDate);

  // ── Header → week-column map ──
  const header = rows[0];
  const weekCols: { colIndex: number; projectWeek: number; label: string }[] = [];
  const weeksOutOfRange: string[] = [];
  for (let c = 1; c < header.length; c++) {
    const label = header[c].trim();
    if (!label) continue;
    const m = label.match(/(\d+)/);
    if (!m) continue;
    const projectWeek = parseInt(m[1], 10) - 1; // labels are 1-based
    if (projectWeek < 0 || projectWeek >= totalWeeks) {
      weeksOutOfRange.push(label);
      continue;
    }
    weekCols.push({ colIndex: c, projectWeek, label });
  }
  if (weekCols.length === 0) {
    return res.status(400).json({
      error: "No valid week columns found in the header (expected W1, W2, …)",
      weeksOutOfRange,
    });
  }

  // ── Resource matching ──
  const assignments = await prisma.resourceAssignment.findMany({
    where: { projectId: ctx.id },
    select: { id: true, user: { select: { id: true, name: true, email: true } } },
  });
  const byName = new Map<string, string>(); // normalised name → assignmentId
  const byEmail = new Map<string, string>();
  for (const a of assignments) {
    byName.set(a.user.name.trim().toLowerCase(), a.id);
    byEmail.set(a.user.email.trim().toLowerCase(), a.id);
  }

  type Upd = { assignmentId: string; projectWeek: number; actualHours: number };
  const updates: Upd[] = [];
  const unmatched: string[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const key = (row[0] ?? "").trim();
    if (!key) continue; // skip blank lines
    const norm = key.toLowerCase();
    const assignmentId = byEmail.get(norm) ?? byName.get(norm);
    if (!assignmentId) {
      unmatched.push(key);
      continue;
    }
    for (const wc of weekCols) {
      const raw = (row[wc.colIndex] ?? "").trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 168) continue; // ignore junk cells
      updates.push({ assignmentId, projectWeek: wc.projectWeek, actualHours: n });
    }
  }

  if (updates.length === 0) {
    return res.json({
      message: "No matching rows to import",
      cellsUpdated: 0,
      matchedResources: 0,
      unmatched,
      weeksOutOfRange,
      skippedLocked: [],
    });
  }

  // ── Apply: load existing entries, skip locked, write actuals, audit ──
  const assignmentIds = [...new Set(updates.map((u) => u.assignmentId))];
  const projectWeeks = [...new Set(updates.map((u) => u.projectWeek))];
  const existing = await prisma.hourEntry.findMany({
    where: { assignmentId: { in: assignmentIds }, projectWeek: { in: projectWeeks } },
  });
  const entryMap = new Map(existing.map((e) => [`${e.assignmentId}|${e.projectWeek}`, e]));

  const skippedLocked: { resourceAssignmentId: string; week: number }[] = [];
  const auditEntries: { entityId: string; oldValue: string | null; newValue: string }[] = [];
  let cellsUpdated = 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const u of updates) {
        const entry = entryMap.get(`${u.assignmentId}|${u.projectWeek}`);
        if (!entry) continue; // week not provisioned (shouldn't happen for in-range weeks)
        if (entry.locked) {
          skippedLocked.push({ resourceAssignmentId: u.assignmentId, week: u.projectWeek });
          continue;
        }
        const oldStr = entry.actualHours != null ? String(Number(entry.actualHours)) : null;
        const newStr = String(u.actualHours);
        if (oldStr === newStr) continue; // no-op
        await tx.hourEntry.update({
          where: { id: entry.id },
          data: { actualHours: new Prisma.Decimal(u.actualHours) },
        });
        auditEntries.push({ entityId: entry.id, oldValue: oldStr, newValue: newStr });
        cellsUpdated++;
      }
    });
  } catch (err) {
    logger.error({ err }, "Hours CSV import failed");
    return res.status(500).json({ error: "Failed to import hours" });
  }

  if (auditEntries.length > 0) {
    await prisma.auditLog.createMany({
      data: auditEntries.map((a) => ({
        entityType: "HourEntry",
        entityId: a.entityId,
        field: "actual_hours",
        oldValue: a.oldValue,
        newValue: a.newValue,
        changedBy: user.id,
      })),
    });
  }

  res.json({
    message: "Import complete",
    cellsUpdated,
    matchedResources: assignmentIds.length,
    unmatched, // names that didn't match any resource (TC 3.18)
    weeksOutOfRange, // week labels outside the project span
    skippedLocked, // (assignment, week) pairs skipped because locked
  });
});

// ═══════════════════════════════════════════════════════════════
// WEEK LOCK / UNLOCK / FILL REMAINING
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/projects/:id/weeks/:week/lock
 * Lock all entries for the given project-week.
 */
router.post("/:id/weeks/:week/lock", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const week = Number(req.params.week);
  if (!Number.isInteger(week) || week < 0) {
    return res.status(400).json({ error: "Invalid week index" });
  }

  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });

  if (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds }) ||
      !canLockWeeks(user)) {
    return res.status(403).json({ error: "Cannot lock weeks on this project" });
  }
  if (ctx.status === "archived") return res.status(409).json({ error: "Project is archived" });

  const entries = await prisma.hourEntry.findMany({
    where: {
      assignment: { projectId: ctx.id },
      projectWeek: week,
    },
    select: { id: true, locked: true },
  });
  if (entries.length === 0) return res.status(404).json({ error: "No entries found for this week" });

  const toLock = entries.filter((e) => !e.locked).map((e) => e.id);
  if (toLock.length === 0) return res.status(409).json({ error: "Week is already locked" });

  await prisma.$transaction([
    prisma.hourEntry.updateMany({ where: { id: { in: toLock } }, data: { locked: true } }),
    prisma.auditLog.createMany({
      data: toLock.map((id) => ({
        entityType: "HourEntry",
        entityId: id,
        field: "locked",
        oldValue: "false",
        newValue: "true",
        changedBy: user.id,
      })),
    }),
  ]);

  logger.info({ projectId: ctx.id, week, entriesLocked: toLock.length, actor: user.id }, "Week locked");
  res.json({
    projectId: ctx.id,
    week,
    locked: true,
    entriesAffected: toLock.length,
    lockedBy: user.id,
    lockedAt: new Date().toISOString(),
  });
});

/**
 * POST /api/projects/:id/weeks/:week/unlock
 * Unlock all entries for the given project-week. No frequency limits — the
 * audit trail is the accountability mechanism. Optional reason recorded on
 * every affected entry's audit row.
 */
router.post("/:id/weeks/:week/unlock", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const parsed = unlockWeekSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }
  const reason = parsed.data.reason;

  const week = Number(req.params.week);
  if (!Number.isInteger(week) || week < 0) {
    return res.status(400).json({ error: "Invalid week index" });
  }

  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });

  if (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds }) ||
      !canLockWeeks(user)) {
    return res.status(403).json({ error: "Cannot unlock weeks on this project" });
  }
  if (ctx.status === "archived") return res.status(409).json({ error: "Project is archived" });

  const entries = await prisma.hourEntry.findMany({
    where: {
      assignment: { projectId: ctx.id },
      projectWeek: week,
    },
    select: { id: true, locked: true },
  });
  if (entries.length === 0) return res.status(404).json({ error: "No entries found for this week" });

  // Guard rail: if any entry is already unlocked, reject — prevents the caller
  // from acting on a stale UI where someone else just reopened the week.
  const alreadyUnlocked = entries.filter((e) => !e.locked);
  if (alreadyUnlocked.length > 0) {
    return res.status(409).json({
      error: "Week is not fully locked",
      details: `${alreadyUnlocked.length} entr${alreadyUnlocked.length === 1 ? "y is" : "ies are"} already unlocked`,
    });
  }

  const toUnlock = entries.map((e) => e.id);
  const newValuePayload = reason ? JSON.stringify({ locked: false, reason }) : "false";

  await prisma.$transaction([
    prisma.hourEntry.updateMany({ where: { id: { in: toUnlock } }, data: { locked: false } }),
    prisma.auditLog.createMany({
      data: toUnlock.map((id) => ({
        entityType: "HourEntry",
        entityId: id,
        field: "locked",
        oldValue: "true",
        newValue: newValuePayload,
        changedBy: user.id,
      })),
    }),
  ]);

  logger.info(
    { projectId: ctx.id, week, entriesUnlocked: toUnlock.length, actor: user.id, reason },
    "Week unlocked"
  );
  res.json({
    projectId: ctx.id,
    week,
    locked: false,
    entriesAffected: toUnlock.length,
    unlockedBy: user.id,
    unlockedAt: new Date().toISOString(),
    reason: reason ?? null,
  });
});

/**
 * POST /api/projects/:id/weeks/:week/fill-remaining
 * For the project-week, copy plannedHours -> actualHours on entries where
 * locked=false, actualHours IS NULL, and plannedHours > 0.
 * IC callers are restricted to their own assignment rows.
 */
router.post("/:id/weeks/:week/fill-remaining", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const week = Number(req.params.week);
  if (!Number.isInteger(week) || week < 0) {
    return res.status(400).json({ error: "Invalid week index" });
  }

  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });

  if (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds })) {
    return res.status(403).json({ error: "No access to this project" });
  }
  if (isPlanLocked(ctx.status)) return res.status(409).json({ error: ctx.status === "complete" ? "Project is complete; its plan is locked. Reopen it to make changes." : "Project is archived" });

  const isICOnly =
    user.roles.includes(Role.IC) &&
    !user.roles.includes(Role.PM) &&
    !user.roles.includes(Role.AC) &&
    !user.roles.includes(Role.BUL) &&
    !user.roles.includes(Role.AA);

  if (!canEditHours(user, isICOnly)) {
    return res.status(403).json({ error: "Cannot edit hours on this project" });
  }

  // Candidates: non-locked, actual is null, planned > 0, on this project-week.
  const candidates = await prisma.hourEntry.findMany({
    where: {
      projectWeek: week,
      locked: false,
      actualHours: null,
      plannedHours: { gt: 0 },
      assignment: {
        projectId: ctx.id,
        ...(isICOnly ? { userId: user.id } : {}),
      },
    },
    select: { id: true, plannedHours: true },
  });

  if (candidates.length === 0) {
    return res.json({ message: "Nothing to fill", entriesAffected: 0 });
  }

  // One UPDATE per candidate so the audit rows carry the actual value copied.
  await prisma.$transaction(async (tx) => {
    for (const c of candidates) {
      await tx.hourEntry.update({
        where: { id: c.id },
        data: { actualHours: c.plannedHours },
      });
    }
    await tx.auditLog.createMany({
      data: candidates.map((c) => ({
        entityType: "HourEntry",
        entityId: c.id,
        field: "actual_hours",
        oldValue: null,
        newValue: c.plannedHours != null ? String(Number(c.plannedHours)) : null,
        changedBy: user.id,
      })),
    });
  });

  logger.info(
    { projectId: ctx.id, week, filled: candidates.length, actor: user.id },
    "Fill-remaining applied"
  );
  res.json({ message: "Filled remaining entries", entriesAffected: candidates.length });
});

// ═══════════════════════════════════════════════════════════════
// BURN CHART
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/projects/:id/burn
 * Cumulative planned vs actual hours per week (+ fee/cost if allowed).
 */
router.get("/:id/burn", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });

  if (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds })) {
    return res.status(403).json({ error: "No access to this project" });
  }

  const assignments = await prisma.resourceAssignment.findMany({
    where: { projectId: ctx.id },
    include: { hourEntries: true },
  });

  // canViewFinancials already in scope via serializeForUser; reuse the same
  // gate to decide whether the burn series includes fee/cost streams.
  const includeFinancials = canViewFinancials(user, ctx.ctx);

  const series = computeBurn(
    assignments.map((a) => ({
      billRate: a.billRate,
      costRate: a.costRate,
      entries: a.hourEntries.map((e) => ({
        projectWeek: e.projectWeek,
        weekStartDate: e.weekStartDate,
        plannedHours: e.plannedHours,
        actualHours: e.actualHours,
      })),
    })),
    includeFinancials
  );

  res.json({
    projectId: ctx.id,
    includesFinancials: includeFinancials,
    series,
  });
});

// ── Tiny internal error helper ──

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Minimal CSV parser for the hours import. Handles the parts that matter for
 * real-world spreadsheet exports: double-quoted fields, escaped quotes ("")
 * inside them, commas and newlines within quotes, and CRLF or LF line
 * endings. UTF-8 is handled natively by JS strings (TC 8.6). Returns an
 * array of rows, each an array of cell strings. Trailing blank line ignored.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      // Close the field/row on a line break. Swallow the \n of a \r\n pair.
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  // Flush the final field/row if the file didn't end with a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows (e.g. a trailing blank line → [""]).
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export default router;
