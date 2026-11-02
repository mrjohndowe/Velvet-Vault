import {
  pgTable, serial, text, integer, bigint, real, boolean, timestamp, jsonb,
  primaryKey, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
});

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  altTitle: text("alt_title"),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileExt: text("file_ext").notNull(),
  format: text("format"),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
  durationSec: real("duration_sec"),
  width: integer("width"),
  height: integer("height"),
  fps: real("fps"),
  codec: text("codec"),
  dateAdded: timestamp("date_added", { withTimezone: true }).notNull().defaultNow(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }),
  fileModifiedAt: timestamp("file_modified_at", { withTimezone: true }),
  lastMetaCheck: timestamp("last_meta_check", { withTimezone: true }),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  studio: text("studio"),
  performers: text("performers"),
  source: text("source"),
  rating: integer("rating").notNull().default(0),
  review: text("review"),
  description: text("description"),
  privateNotes: text("private_notes"),
  favorite: boolean("favorite").notNull().default(false),
  bookmarked: boolean("bookmarked").notNull().default(false),
  watchStatus: text("watch_status").notNull().default("unwatched"),
  lastWatchedAt: timestamp("last_watched_at", { withTimezone: true }),
  watchCount: integer("watch_count").notNull().default(0),
  progressSec: real("progress_sec").notNull().default(0),
  missing: boolean("missing").notNull().default(false),
  hash: text("hash"),
  privacy: text("privacy").notNull().default("standard"),
  contentWarnings: text("content_warnings"),
}, (t) => [
  uniqueIndex("videos_path_uq").on(t.filePath),
  index("videos_title_idx").on(t.title),
  index("videos_file_name_idx").on(t.fileName),
  index("videos_category_idx").on(t.categoryId),
  index("videos_status_idx").on(t.watchStatus),
  index("videos_size_idx").on(t.sizeBytes),
  index("videos_duration_idx").on(t.durationSec),
  index("videos_added_idx").on(t.dateAdded),
  index("videos_rating_idx").on(t.rating),
  index("videos_hash_idx").on(t.hash),
  index("videos_missing_idx").on(t.missing),
]);

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
}, (t) => [uniqueIndex("tags_name_uq").on(t.name)]);

export const videoTags = pgTable("video_tags", {
  videoId: integer("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.videoId, t.tagId] })]);

export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  kind: text("kind").notNull().default("collection"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const collectionVideos = pgTable("collection_videos", {
  collectionId: integer("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  videoId: integer("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.collectionId, t.videoId] })]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  event: text("event").notNull(),
  detail: jsonb("detail"),
}, (t) => [index("audit_ts_idx").on(t.ts)]);

export type Video = typeof videos.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Collection = typeof collections.$inferSelect;