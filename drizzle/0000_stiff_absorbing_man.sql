CREATE TABLE `writeon_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`capture_seq` integer DEFAULT 0 NOT NULL,
	`frame_seq` integer DEFAULT 0 NOT NULL,
	`frame_base64` text,
	`frame_mime` text,
	`captured_at` integer,
	`phone_seen_at` integer,
	`phone_ready` integer DEFAULT 0 NOT NULL,
	`transcript` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`uncertain` integer DEFAULT 0 NOT NULL,
	`transcript_seq` integer DEFAULT 0 NOT NULL,
	`transcribing_seq` integer,
	`transcribing_at` integer
);
--> statement-breakpoint
CREATE INDEX `rooms_owner_idx` ON `writeon_rooms` (`owner`);--> statement-breakpoint
CREATE INDEX `rooms_expiry_idx` ON `writeon_rooms` (`expires_at`);