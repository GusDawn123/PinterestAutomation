CREATE TYPE "public"."workflow_kind" AS ENUM('blog', 'pins');
CREATE TYPE "public"."workflow_status" AS ENUM('running', 'awaiting_approval', 'completed', 'failed', 'cancelled');
CREATE TYPE "public"."approval_kind" AS ENUM('keyword', 'draft', 'images', 'pins', 'publish');
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'changes_requested');

CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" "workflow_kind" NOT NULL,
  "status" "workflow_status" DEFAULT 'running' NOT NULL,
  "current_step" text NOT NULL,
  "context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "finished_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "workflow_runs_status_idx" ON "workflow_runs" ("status");
CREATE INDEX IF NOT EXISTS "workflow_runs_created_at_idx" ON "workflow_runs" ("created_at");

CREATE TABLE IF NOT EXISTS "approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "kind" "approval_kind" NOT NULL,
  "payload" jsonb NOT NULL,
  "status" "approval_status" DEFAULT 'pending' NOT NULL,
  "decision_data" jsonb,
  "notes" text,
  "decided_by" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "decided_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "approvals_workflow_run_id_idx" ON "approvals" ("workflow_run_id");
CREATE INDEX IF NOT EXISTS "approvals_status_idx" ON "approvals" ("status");

CREATE TABLE IF NOT EXISTS "blog_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "keyword" text NOT NULL,
  "brief" text NOT NULL,
  "draft" jsonb NOT NULL,
  "wordpress_post_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "blog_drafts_workflow_run_id_idx" ON "blog_drafts" ("workflow_run_id");
