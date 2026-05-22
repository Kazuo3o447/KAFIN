CREATE TABLE IF NOT EXISTS `peer_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` text NOT NULL,
	`ticker` text NOT NULL,
	`bucket_id` text NOT NULL,
	`computed_at` integer NOT NULL,
	`percentiles_json` text NOT NULL,
	`vs_median_json` text NOT NULL,
	`computed_keys` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `peer_metrics_report_idx` ON `peer_metrics` (`report_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `peer_metrics_ticker_idx` ON `peer_metrics` (`ticker`);
