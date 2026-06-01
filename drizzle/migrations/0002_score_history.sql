CREATE TABLE IF NOT EXISTS `score_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` text NOT NULL,
	`ticker` text NOT NULL,
	`research_date` text NOT NULL,
	`score_total` integer NOT NULL,
	`gate` text NOT NULL,
	`confidence` text NOT NULL,
	`created_at` integer NOT NULL,
	`delta_from_previous` integer,
	`trend` text NOT NULL,
	UNIQUE(`report_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `score_history_ticker_date_idx` ON `score_history` (`ticker`, `research_date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `score_history_ticker_idx` ON `score_history` (`ticker`);
