-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('FREE', 'SUPER_USER', 'ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'FREE';
