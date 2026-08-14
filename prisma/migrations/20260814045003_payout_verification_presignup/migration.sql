-- AlterTable
ALTER TABLE "AffiliateApplication" ADD COLUMN     "payout_identifier" TEXT,
ADD COLUMN     "payout_method" TEXT;

-- AlterTable
ALTER TABLE "PayoutMethodVerification" ADD COLUMN     "applicant_email" TEXT,
ALTER COLUMN "affiliate_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "PayoutMethodVerification_applicant_email_created_at_idx" ON "PayoutMethodVerification"("applicant_email", "created_at");

-- CreateIndex
CREATE INDEX "PayoutMethodVerification_initiated_ip_created_at_idx" ON "PayoutMethodVerification"("initiated_ip", "created_at");

-- CreateIndex
CREATE INDEX "PayoutMethodVerification_identifier_created_at_idx" ON "PayoutMethodVerification"("identifier", "created_at");
