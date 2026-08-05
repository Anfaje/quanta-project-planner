-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'on_hold', 'complete', 'archived', 'draft');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('time_and_materials', 'fixed_price');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('IC', 'PM', 'AC', 'BUL', 'AA');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "totp_secret" TEXT,
    "totp_verified" BOOLEAN NOT NULL DEFAULT false,
    "roles" "Role"[] DEFAULT ARRAY['IC']::"Role"[],
    "project_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primary_bu_id" TEXT NOT NULL,
    "financial_access" BOOLEAN NOT NULL DEFAULT false,
    "cost_rate" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_units" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_managers" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "account_managers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_whitelist" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "added_by" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_whitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "owning_bu_id" TEXT NOT NULL,
    "project_code" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "contingency_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.15,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "pricing_model" "PricingModel" NOT NULL DEFAULT 'time_and_materials',
    "fixed_price" DECIMAL(12,2),
    "description" TEXT,
    "rejection_note" TEXT,
    "rejection_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_shares" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "shared_with_bu_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_reviewers" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "added_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_reviewers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_assignments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_role" TEXT NOT NULL,
    "bill_rate" DECIMAL(10,2),
    "cost_rate" DECIMAL(10,2) NOT NULL,
    "business_unit" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hour_entries" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "project_week" INTEGER NOT NULL,
    "week_start_date" DATE NOT NULL,
    "planned_hours" DECIMAL(5,2),
    "actual_hours" DECIMAL(5,2),
    "locked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "hour_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "global_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "user_invites" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "bu_id" TEXT NOT NULL,
    "project_role" TEXT,
    "roles" "Role"[] DEFAULT ARRAY['IC']::"Role"[],
    "invited_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_baselines" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "captured_by" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "plan_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_primary_bu_id_idx" ON "users"("primary_bu_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_units_code_key" ON "business_units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_code_key" ON "accounts"("code");

-- CreateIndex
CREATE INDEX "account_managers_user_id_idx" ON "account_managers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_managers_account_id_user_id_key" ON "account_managers"("account_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "domain_whitelist_domain_key" ON "domain_whitelist"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "projects_project_code_key" ON "projects"("project_code");

-- CreateIndex
CREATE INDEX "projects_account_id_owning_bu_id_status_idx" ON "projects"("account_id", "owning_bu_id", "status");

-- CreateIndex
CREATE INDEX "project_shares_shared_with_bu_id_idx" ON "project_shares"("shared_with_bu_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_shares_project_id_shared_with_bu_id_key" ON "project_shares"("project_id", "shared_with_bu_id");

-- CreateIndex
CREATE INDEX "project_reviewers_user_id_idx" ON "project_reviewers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_reviewers_project_id_user_id_key" ON "project_reviewers"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_assignments_project_id_user_id_key" ON "resource_assignments"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "hour_entries_assignment_id_project_week_idx" ON "hour_entries"("assignment_id", "project_week");

-- CreateIndex
CREATE UNIQUE INDEX "hour_entries_assignment_id_project_week_key" ON "hour_entries"("assignment_id", "project_week");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_changed_at_idx" ON "audit_logs"("entity_type", "entity_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_invites_token_key" ON "user_invites"("token");

-- CreateIndex
CREATE INDEX "user_invites_email_idx" ON "user_invites"("email");

-- CreateIndex
CREATE INDEX "user_invites_expires_at_idx" ON "user_invites"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_key" ON "password_resets"("token");

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_baselines_project_id_key" ON "plan_baselines"("project_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_primary_bu_id_fkey" FOREIGN KEY ("primary_bu_id") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_managers" ADD CONSTRAINT "account_managers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_managers" ADD CONSTRAINT "account_managers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_whitelist" ADD CONSTRAINT "domain_whitelist_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owning_bu_id_fkey" FOREIGN KEY ("owning_bu_id") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_shares" ADD CONSTRAINT "project_shares_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_shares" ADD CONSTRAINT "project_shares_shared_with_bu_id_fkey" FOREIGN KEY ("shared_with_bu_id") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_reviewers" ADD CONSTRAINT "project_reviewers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_reviewers" ADD CONSTRAINT "project_reviewers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_reviewers" ADD CONSTRAINT "project_reviewers_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hour_entries" ADD CONSTRAINT "hour_entries_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "resource_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_bu_id_fkey" FOREIGN KEY ("bu_id") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_baselines" ADD CONSTRAINT "plan_baselines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_baselines" ADD CONSTRAINT "plan_baselines_captured_by_fkey" FOREIGN KEY ("captured_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

