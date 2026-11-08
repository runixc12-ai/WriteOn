// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('writeon_rooms', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), tokenHash: text('token_hash').notNull(),
 createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
 captureSeq: integer('capture_seq').notNull().default(0), frameSeq: integer('frame_seq').notNull().default(0),
 frameBase64: text('frame_base64'), frameMime: text('frame_mime'), capturedAt: integer('captured_at'),
 phoneSeenAt: integer('phone_seen_at'), phoneReady: integer('phone_ready').notNull().default(0),
 transcript: text('transcript').notNull().default(''), notes: text('notes').notNull().default(''),
 uncertain: integer('uncertain').notNull().default(0), transcriptSeq: integer('transcript_seq').notNull().default(0),
 transcribingSeq: integer('transcribing_seq'), transcribingAt: integer('transcribing_at'),
}, t => [index('rooms_owner_idx').on(t.owner), index('rooms_expiry_idx').on(t.expiresAt)]);
