CREATE TABLE IF NOT EXISTS "pins_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_run_id" uuid REFERENCES "workflow_runs"("id") ON DELETE SET NULL,
  "blog_post_id" integer,
  "image_url" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "board_id" text NOT NULL,
  "link_back_url" text NOT NULL,
  "scheduled_at" timestamptz NOT NULL,
  "posted_at" timestamptz,
  "pinterest_pin_id" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pins_queue_due_idx" ON "pins_queue" ("scheduled_at", "posted_at");
CREATE INDEX IF NOT EXISTS "pins_queue_board_idx" ON "pins_queue" ("board_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pins_queue_pinterest_pin_id_uniq" ON "pins_queue" ("pinterest_pin_id");

CREATE TABLE IF NOT EXISTS "pin_analytics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pinterest_pin_id" text NOT NULL,
  "board_id" text NOT NULL,
  "impressions" integer NOT NULL DEFAULT 0,
  "saves" integer NOT NULL DEFAULT 0,
  "outbound_clicks" integer NOT NULL DEFAULT 0,
  "closeups" integer NOT NULL DEFAULT 0,
  "observed_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pin_analytics_pin_idx" ON "pin_analytics" ("pinterest_pin_id");
CREATE INDEX IF NOT EXISTS "pin_analytics_observed_idx" ON "pin_analytics" ("observed_at");
CREATE INDEX IF NOT EXISTS "pin_analytics_board_idx" ON "pin_analytics" ("board_id");

CREATE TABLE IF NOT EXISTS "recommended_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "board_id" text NOT NULL,
  "day_of_week" integer NOT NULL,
  "hour" integer NOT NULL,
  "score" real NOT NULL,
  "sample_size" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "computed_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "recommended_slots_board_day_hour_uniq" ON "recommended_slots" ("board_id", "day_of_week", "hour");
CREATE INDEX IF NOT EXISTS "recommended_slots_board_idx" ON "recommended_slots" ("board_id");
