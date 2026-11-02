CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"event" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer
);
--> statement-breakpoint
CREATE TABLE "collection_videos" (
	"collection_id" integer NOT NULL,
	"video_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "collection_videos_collection_id_video_id_pk" PRIMARY KEY("collection_id","video_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'collection' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_tags" (
	"video_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "video_tags_video_id_tag_id_pk" PRIMARY KEY("video_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"alt_title" text,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"file_ext" text NOT NULL,
	"format" text,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"duration_sec" real,
	"width" integer,
	"height" integer,
	"fps" real,
	"codec" text,
	"date_added" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_at" timestamp with time zone,
	"file_modified_at" timestamp with time zone,
	"last_meta_check" timestamp with time zone,
	"category_id" integer,
	"studio" text,
	"performers" text,
	"source" text,
	"rating" integer DEFAULT 0 NOT NULL,
	"review" text,
	"description" text,
	"private_notes" text,
	"favorite" boolean DEFAULT false NOT NULL,
	"bookmarked" boolean DEFAULT false NOT NULL,
	"watch_status" text DEFAULT 'unwatched' NOT NULL,
	"last_watched_at" timestamp with time zone,
	"watch_count" integer DEFAULT 0 NOT NULL,
	"progress_sec" real DEFAULT 0 NOT NULL,
	"missing" boolean DEFAULT false NOT NULL,
	"hash" text,
	"privacy" text DEFAULT 'standard' NOT NULL,
	"content_warnings" text
);
--> statement-breakpoint
ALTER TABLE "collection_videos" ADD CONSTRAINT "collection_videos_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_videos" ADD CONSTRAINT "collection_videos_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_tags" ADD CONSTRAINT "video_tags_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_tags" ADD CONSTRAINT "video_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_ts_idx" ON "audit_log" USING btree ("ts");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_uq" ON "tags" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "videos_path_uq" ON "videos" USING btree ("file_path");--> statement-breakpoint
CREATE INDEX "videos_title_idx" ON "videos" USING btree ("title");--> statement-breakpoint
CREATE INDEX "videos_file_name_idx" ON "videos" USING btree ("file_name");--> statement-breakpoint
CREATE INDEX "videos_category_idx" ON "videos" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "videos_status_idx" ON "videos" USING btree ("watch_status");--> statement-breakpoint
CREATE INDEX "videos_size_idx" ON "videos" USING btree ("size_bytes");--> statement-breakpoint
CREATE INDEX "videos_duration_idx" ON "videos" USING btree ("duration_sec");--> statement-breakpoint
CREATE INDEX "videos_added_idx" ON "videos" USING btree ("date_added");--> statement-breakpoint
CREATE INDEX "videos_rating_idx" ON "videos" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "videos_hash_idx" ON "videos" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "videos_missing_idx" ON "videos" USING btree ("missing");