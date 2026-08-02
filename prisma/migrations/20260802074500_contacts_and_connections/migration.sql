-- CreateEnum
CREATE TYPE "ConnectionProvider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'DISCONNECTED', 'CONNECTED', 'NEEDS_ATTENTION', 'EXPIRED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "whatsapp" TEXT,
ADD COLUMN     "workEnd" TEXT DEFAULT '18:00',
ADD COLUMN     "workStart" TEXT DEFAULT '09:00';

-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ConnectionProvider" NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "accountEmail" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "syncCursor" TEXT,
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connections_organizationId_idx" ON "connections"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "connections_userId_provider_key" ON "connections"("userId", "provider");

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
