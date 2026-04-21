-- Phase 2: record which Ideogram variant Carmen picked per image slot.
ALTER TABLE "blog_drafts" ADD COLUMN "chosen_images" jsonb;
