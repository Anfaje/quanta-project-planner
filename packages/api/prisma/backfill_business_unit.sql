-- One-time, idempotent data fix.
--
-- Earlier code stored the business unit's id (a UUID) in
-- resource_assignments.business_unit instead of its human-readable code, so the
-- UI showed a raw GUID in the "BU" column. This converts any id-valued
-- business_unit to the matching code.
--
-- It is safe to run on every release: after conversion the values are codes,
-- which never equal a business_units.id, so subsequent runs match zero rows.
UPDATE "resource_assignments" AS ra
SET "business_unit" = bu."code"
FROM "business_units" AS bu
WHERE ra."business_unit" = bu."id";
