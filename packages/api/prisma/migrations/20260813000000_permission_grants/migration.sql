-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('view_financials', 'view_bill_rates', 'manage_projects', 'approve_drafts', 'manage_users');

-- CreateEnum
CREATE TYPE "GrantScope" AS ENUM ('platform', 'business_unit', 'account', 'project');

-- CreateTable
CREATE TABLE "permission_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" "Permission" NOT NULL,
    "scope_type" "GrantScope" NOT NULL,
    "scope_id" TEXT,
    "granted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "permission_grants_user_id_idx" ON "permission_grants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "permission_grants_user_id_permission_scope_type_scope_id_key" ON "permission_grants"("user_id", "permission", "scope_type", "scope_id");

-- AddForeignKey
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

