-- P3: drei Achsen + Safety-Gate + Archetype in score_history
ALTER TABLE `score_history` ADD `axes_json` text;
--> statement-breakpoint
ALTER TABLE `score_history` ADD `safety_status` text;
--> statement-breakpoint
ALTER TABLE `score_history` ADD `archetype` text;
