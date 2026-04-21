ALTER TYPE "approval_kind" ADD VALUE IF NOT EXISTS 'affiliates';

ALTER TABLE "blog_drafts" ADD COLUMN IF NOT EXISTS "affiliate_products" jsonb;
