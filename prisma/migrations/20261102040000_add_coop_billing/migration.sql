-- AlterTable
ALTER TABLE "Coop" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionInterval" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3) NOT NULL DEFAULT (now() + '30 days'::interval);

-- Existing co-ops get a trial measured from when they were created.
UPDATE "Coop" SET "trialEndsAt" = "createdAt" + '30 days'::interval;

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coop_stripeCustomerId_key" ON "Coop"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Coop_stripeSubscriptionId_key" ON "Coop"("stripeSubscriptionId");

