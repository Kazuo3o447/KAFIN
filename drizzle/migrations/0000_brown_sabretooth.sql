CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`ticker` text NOT NULL,
	`exchange` text,
	`company_name` text,
	`research_date` text NOT NULL,
	`run_id` text NOT NULL,
	`category` text,
	`gate` text,
	`score_total` integer,
	`score_breakdown` text,
	`confidence` text,
	`report_md_path` text,
	`report_json_path` text,
	`raw_dir` text,
	`created_at` integer NOT NULL,
	`duration_ms` integer,
	`model_extract` text,
	`model_scoring` text,
	`model_summary` text,
	`hard_blockers` text,
	`handoff_to_trade_engine` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_run_id_unique` ON `reports` (`run_id`);--> statement-breakpoint
CREATE INDEX `reports_ticker_date_idx` ON `reports` (`ticker`,`research_date`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`ticker` text NOT NULL,
	`status` text NOT NULL,
	`progress` integer DEFAULT 0,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`report_id` text
);
--> statement-breakpoint
CREATE INDEX `runs_status_idx` ON `runs` (`status`,`started_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`class` text,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sources_report_idx` ON `sources` (`report_id`);--> statement-breakpoint
CREATE TABLE `watchlist` (
	`ticker` text PRIMARY KEY NOT NULL,
	`added_at` integer NOT NULL,
	`notes` text,
	`last_report_id` text
);
