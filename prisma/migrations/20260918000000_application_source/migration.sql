-- Where an applicant came from, e.g. /apply?source=meta-dm.
-- Nullable and additive: every existing row keeps working with no backfill.
ALTER TABLE "AffiliateApplication" ADD COLUMN "source" TEXT;
