import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Frozen snapshot of a project's plan, captured the first time it goes active.
 * Shape is the contract between capture (here) and the comparison view.
 */
export interface BaselineAssignmentSnapshot {
  userId: string;
  name: string; // frozen display name at baseline time
  projectRole: string;
  businessUnit: string;
  billRate: number;
  costRate: number;
  plannedHours: number; // total planned across all weeks at baseline
  weekly: Array<{ projectWeek: number; plannedHours: number }>;
}

export interface PlanBaselineSnapshot {
  startDate: string; // yyyy-mm-dd
  endDate: string;
  contingencyPct: number;
  capturedAtStatus: string;
  assignments: BaselineAssignmentSnapshot[];
}

type Db = PrismaClient | Prisma.TransactionClient;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Capture the Initial Plan for a project. Idempotent and immutable: if a
 * baseline already exists it is left untouched (a project is baselined once,
 * at launch). Safe to call inside a transaction (pass the tx client).
 */
export async function captureBaseline(
  db: Db,
  projectId: string,
  capturedById: string
): Promise<void> {
  const existing = await db.planBaseline.findUnique({ where: { projectId } });
  if (existing) return;

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      startDate: true,
      endDate: true,
      contingencyPct: true,
      status: true,
      assignments: {
        select: {
          userId: true,
          projectRole: true,
          businessUnit: true,
          billRate: true,
          costRate: true,
          user: { select: { name: true } },
          hourEntries: { select: { projectWeek: true, plannedHours: true } },
        },
      },
    },
  });
  if (!project) return;

  const assignments: BaselineAssignmentSnapshot[] = project.assignments.map((a) => {
    const weekly = a.hourEntries
      .filter((h) => h.plannedHours != null)
      .map((h) => ({ projectWeek: h.projectWeek, plannedHours: Number(h.plannedHours) }))
      .sort((x, y) => x.projectWeek - y.projectWeek);
    const plannedHours = weekly.reduce((sum, w) => sum + w.plannedHours, 0);
    return {
      userId: a.userId,
      name: a.user.name,
      projectRole: a.projectRole,
      businessUnit: a.businessUnit,
      billRate: Number(a.billRate),
      costRate: Number(a.costRate),
      plannedHours,
      weekly,
    };
  });

  const snapshot: PlanBaselineSnapshot = {
    startDate: isoDate(project.startDate),
    endDate: isoDate(project.endDate),
    contingencyPct: Number(project.contingencyPct),
    capturedAtStatus: project.status,
    assignments,
  };

  await db.planBaseline.create({
    data: {
      projectId,
      capturedById,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });
}
