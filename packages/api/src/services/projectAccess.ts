import { Prisma, Role } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { AuthUser, ResourceContext } from "../types";
import { PROJECT_PERMISSIONS } from "../lib/permissions";

/**
 * Project Access Helpers
 *
 * The permission resolver (lib/permissions.ts) answers "can this user do X on
 * this specific project?". These helpers translate the same scoping rules into
 * Prisma queries — so LIST endpoints return exactly the projects a user may see
 * without leaking anything at the query layer.
 */

/**
 * Build a Prisma where-filter that restricts results to projects the caller
 * can access. Returns the OR-union of all of their role-based paths.
 *
 * Must be combined with any other caller-supplied filters via `AND`.
 */
export function buildProjectAccessFilter(user: AuthUser): Prisma.ProjectWhereInput {
  // AA: platform-wide access
  if (user.roles.includes(Role.AA)) {
    return {};
  }

  const orClauses: Prisma.ProjectWhereInput[] = [];

  // IC / PM: projects they're assigned to
  if (user.roles.includes(Role.IC) || user.roles.includes(Role.PM)) {
    orClauses.push({ assignments: { some: { userId: user.id } } });
  }

  // AC: projects in their managed accounts
  if (user.roles.includes(Role.AC) && user.managedAccountIds.length > 0) {
    orClauses.push({ accountId: { in: user.managedAccountIds } });
  }

  // BUL: projects owned by their BU or shared with their BU
  if (user.roles.includes(Role.BUL)) {
    orClauses.push({ owningBuId: user.primaryBuId });
    orClauses.push({ shares: { some: { sharedWithBuId: user.primaryBuId } } });
  }

  // Grants widen visibility: any project-flavoured grant covers its scope.
  const projectGrants = (user.grants ?? []).filter((g) =>
    PROJECT_PERMISSIONS.includes(g.permission)
  );
  if (projectGrants.some((g) => g.scopeType === "platform")) {
    return {};
  }
  const grantBuIds = [
    ...new Set(
      projectGrants
        .filter((g) => g.scopeType === "business_unit" && g.scopeId != null)
        .map((g) => g.scopeId as string)
    ),
  ];
  const grantAccountIds = [
    ...new Set(
      projectGrants
        .filter((g) => g.scopeType === "account" && g.scopeId != null)
        .map((g) => g.scopeId as string)
    ),
  ];
  const grantProjectIds = [
    ...new Set(
      projectGrants
        .filter((g) => g.scopeType === "project" && g.scopeId != null)
        .map((g) => g.scopeId as string)
    ),
  ];
  if (grantBuIds.length > 0) {
    orClauses.push({ owningBuId: { in: grantBuIds } });
    orClauses.push({ shares: { some: { sharedWithBuId: { in: grantBuIds } } } });
  }
  if (grantAccountIds.length > 0) {
    orClauses.push({ accountId: { in: grantAccountIds } });
  }
  if (grantProjectIds.length > 0) {
    orClauses.push({ id: { in: grantProjectIds } });
  }

  if (orClauses.length === 0) {
    // No role paths match — match no rows. Using a never-matching id keeps
    // the query trivial for Postgres to short-circuit.
    return { id: "__no_access__" };
  }

  return { OR: orClauses };
}

export interface ProjectContext {
  id: string;
  accountId: string;
  owningBuId: string;
  status: string;
  createdById: string;
  startDate: Date;
  endDate: Date;
  contingencyPct: Prisma.Decimal;
  pricingModel: string;
  fixedPrice: Prisma.Decimal | null;
  projectCode: string;
  name: string;
  ctx: ResourceContext;
  assignedUserIds: string[];
  sharedBuIds: string[];
}

/**
 * Load a single project with the shape the resolver and serialiser expect.
 * Returns null if the project doesn't exist. The caller is responsible for
 * running canAccessProject(user, ctx.ctx) before returning anything to them.
 */
export async function loadProjectContext(
  prisma: PrismaClient,
  projectId: string
): Promise<ProjectContext | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      projectCode: true,
      accountId: true,
      owningBuId: true,
      status: true,
      createdById: true,
      startDate: true,
      endDate: true,
      contingencyPct: true,
      pricingModel: true,
      fixedPrice: true,
      assignments: { select: { userId: true } },
      shares: { select: { sharedWithBuId: true } },
    },
  });
  if (!project) return null;

  const assignedUserIds = project.assignments.map((a) => a.userId);
  const sharedBuIds = project.shares.map((s) => s.sharedWithBuId);

  return {
    id: project.id,
    name: project.name,
    projectCode: project.projectCode,
    accountId: project.accountId,
    owningBuId: project.owningBuId,
    status: project.status,
    createdById: project.createdById,
    startDate: project.startDate,
    endDate: project.endDate,
    contingencyPct: project.contingencyPct,
    pricingModel: project.pricingModel,
    fixedPrice: project.fixedPrice,
    ctx: {
      projectId: project.id,
      projectAccountId: project.accountId,
      projectOwningBuId: project.owningBuId,
      projectSharedBuIds: sharedBuIds,
    },
    assignedUserIds,
    sharedBuIds,
  };
}
