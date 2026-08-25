-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'GBP', 'DKK', 'EUR', 'CHF', 'CAD');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'USD';

