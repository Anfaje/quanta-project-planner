import type { AuthUser, ResourceContext } from "../types";
import { canViewFinancials, canViewBillRates } from "../lib/permissions";

/**
 * Financial Serialiser
 *
 * Strips restricted fields from API responses before they leave the server.
 * This is the last line of defence — even if a route accidentally omits
 * middleware, the serialiser prevents data leakage.
 *
 * Rules:
 *   IC:  no bill rates, no cost rates, no financials
 *   PM:  bill rates YES, cost rates NO, financials NO
 *   AC:  all financials IF project is in their managed Accounts
 *   BUL: all financials IF project is in their BU or shared
 *   AA:  all financials IF financial_access flag is set
 */

// Fields that are always stripped from IC responses
const IC_STRIPPED = ["billRate", "bill_rate", "costRate", "cost_rate"];

// Fields stripped from PM responses (they see bill rates but not cost/margin)
const PM_STRIPPED = ["costRate", "cost_rate"];

// Financial aggregate fields (cost, fee, margin, contingency)
const FINANCIAL_FIELDS = [
  "costRate", "cost_rate",
  "totalCost", "total_cost",
  "totalFee", "total_fee",
  "fixedPrice", "fixed_price",
  "margin", "marginPct", "margin_pct",
  "marginDollar", "margin_dollar",
  "contingencyAmt", "contingency_amt",
  "adjustedFee", "adjusted_fee",
  "profit", "profitToDate", "profit_to_date",
];

/**
 * Strip financial fields from a single object based on the user's effective permissions.
 */
export function serializeForUser<T extends Record<string, any>>(
  data: T,
  user: AuthUser,
  ctx: ResourceContext
): Partial<T> {
  const result = { ...data };
  const showFinancials = canViewFinancials(user, ctx);
  const showBillRates = canViewBillRates(user);

  if (!showFinancials) {
    // Strip all financial aggregate fields
    for (const field of FINANCIAL_FIELDS) {
      delete result[field];
    }
  }

  if (!showBillRates) {
    // IC: strip bill rates too
    for (const field of IC_STRIPPED) {
      delete result[field];
    }
  } else if (!showFinancials) {
    // PM: has bill rates but not cost rates
    for (const field of PM_STRIPPED) {
      delete result[field];
    }
  }

  return result;
}

/**
 * Strip financial fields from an array of objects.
 */
export function serializeArrayForUser<T extends Record<string, any>>(
  data: T[],
  user: AuthUser,
  ctx: ResourceContext
): Partial<T>[] {
  return data.map((item) => serializeForUser(item, user, ctx));
}

/**
 * Strip financial fields from a resource assignment object.
 * This is the most common use case — resource rows in the hours grid or project detail.
 */
export function serializeAssignment(
  assignment: Record<string, any>,
  user: AuthUser,
  ctx: ResourceContext
): Record<string, any> {
  const result = { ...assignment };
  const showFinancials = canViewFinancials(user, ctx);
  const showBillRates = canViewBillRates(user);

  if (!showBillRates) {
    delete result.billRate;
    delete result.bill_rate;
  }

  if (!showFinancials) {
    delete result.costRate;
    delete result.cost_rate;
    // Also strip any computed fields that might be attached
    delete result.fee;
    delete result.cost;
    delete result.margin;
  }

  return result;
}

/**
 * Determine which financial columns should be included in an export.
 * Used by CSV and PDF export endpoints.
 */
export function getExportColumns(
  user: AuthUser,
  ctx: ResourceContext
): { includeBillRate: boolean; includeCostRate: boolean; includeFinancials: boolean } {
  return {
    includeBillRate: canViewBillRates(user),
    includeCostRate: canViewFinancials(user, ctx),
    includeFinancials: canViewFinancials(user, ctx),
  };
}
