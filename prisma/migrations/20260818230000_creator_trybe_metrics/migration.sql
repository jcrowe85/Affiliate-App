-- AlterTable
ALTER TABLE "CreatorLead" ADD COLUMN     "trybe_metrics" JSONB,
ADD COLUMN     "gmv_30d" DECIMAL(12,2),
ADD COLUMN     "submissions_30d" INTEGER,
ADD COLUMN     "approval_rate" DECIMAL(5,2),
ADD COLUMN     "brand_partnerships" INTEGER,
ADD COLUMN     "sample_score" DECIMAL(8,3);
