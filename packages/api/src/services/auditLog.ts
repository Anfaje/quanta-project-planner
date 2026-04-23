import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

/**
 * Audit Log Service
 *
 * All data modifications are logged with actor, timestamp, field changed,
 * old value, and new value. Logs are append-only (INSERT only, no UPDATE/DELETE).
 */

interface AuditEntry {
  entityType: string;
  entityId: string;
  field: string;
  oldValue?: string | null;
  newValue?: string | null;
  changedBy: string;
}

/**
 * Log a single field change.
 */
export async function logChange(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: entry.entityType,
        entityId: entry.entityId,
        field: entry.field,
        oldValue: entry.oldValue ?? null,
        newValue: entry.newValue ?? null,
        changedBy: entry.changedBy,
      },
    });
  } catch (err) {
    // Audit failures should never break the main operation
    logger.error({ err, entry }, "Failed to write audit log");
  }
}

/**
 * Log multiple field changes on the same entity (e.g. role change updates roles + managedAccounts).
 */
export async function logChanges(
  entityType: string,
  entityId: string,
  changedBy: string,
  changes: Array<{ field: string; oldValue?: string | null; newValue?: string | null }>
): Promise<void> {
  try {
    await prisma.auditLog.createMany({
      data: changes.map((c) => ({
        entityType,
        entityId,
        field: c.field,
        oldValue: c.oldValue ?? null,
        newValue: c.newValue ?? null,
        changedBy,
      })),
    });
  } catch (err) {
    logger.error({ err, entityType, entityId }, "Failed to write audit logs");
  }
}

/**
 * Compare two objects and return the changed fields.
 * Useful for detecting what changed before logging.
 */
export function diffFields(
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
  fields: string[]
): Array<{ field: string; oldValue: string | null; newValue: string | null }> {
  const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];

  for (const field of fields) {
    const oldVal = JSON.stringify(oldObj[field] ?? null);
    const newVal = JSON.stringify(newObj[field] ?? null);
    if (oldVal !== newVal) {
      changes.push({ field, oldValue: oldVal, newValue: newVal });
    }
  }

  return changes;
}
