import { db } from "@/db";
import { categories, tags, videoTags, collections, collectionVideos, videos } from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { requireOwner } from "@/lib/auth";
import { guardMutation, ok, fail, readBody, errMsg, intOr, strOr } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireOwner(); if (denied) return denied;
  try {
    const cats = await db.select({ id: categories.id, name: categories.name, parentId: categories.parentId, n: sql<number>`count(${videos.id})::int` })
      .from(categories).leftJoin(videos, eq(videos.categoryId, categories.id)).groupBy(categories.id).orderBy(categories.name);
    const tgs = await db.select({ id: tags.id, name: tags.name, n: sql<number>`count(${videoTags.videoId})::int` })
      .from(tags).leftJoin(videoTags, eq(videoTags.tagId, tags.id)).groupBy(tags.id).orderBy(tags.name);
    const cols = await db.select({ id: collections.id, name: collections.name, description: collections.description, kind: collections.kind, createdAt: collections.createdAt, n: sql<number>`count(${collectionVideos.videoId})::int` })
      .from(collections).leftJoin(collectionVideos, eq(collectionVideos.collectionId, collections.id)).groupBy(collections.id).orderBy(collections.name);
    return ok({ categories: cats, tags: tgs, collections: cols });
  } catch (e) { return fail(errMsg(e), 500); }
}

export async function POST(req: Request) {
  const denied = await guardMutation(req); if (denied) return denied;
  try {
    const b = await readBody(req);
    const type = String(b.type ?? "");
    if (type === "collection-add" || type === "collection-remove") {
      const cid = intOr(b.collectionId); if (!cid) return fail("Missing collection.");
      const vids = Array.isArray(b.videoIds) ? (b.videoIds as number[]).map(Number).filter((n) => n > 0) : [];
      if (!vids.length) return fail("No videos given.");
      if (type === "collection-add") {
        const [{ m }] = await db.select({ m: sql<number>`coalesce(max(${collectionVideos.position}),0)::int` }).from(collectionVideos).where(eq(collectionVideos.collectionId, cid));
        let pos = m;
        for (const vid of vids) await db.insert(collectionVideos).values({ collectionId: cid, videoId: vid, position: ++pos }).onConflictDoNothing();
      } else {
        await db.delete(collectionVideos).where(sql`${collectionVideos.collectionId} = ${cid} and ${collectionVideos.videoId} in (${sql.join(vids.map((v) => sql`${v}`), sql`,`)})`);
      }
      return ok({ done: true });
    }
    const name = strOr(b.name);
    if (!name) return fail("Name is required.");
    if (name.length > 120) return fail("Name is too long (max 120).");
    if (type === "category") {
      const [row] = await db.insert(categories).values({ name, parentId: intOr(b.parentId) }).returning();
      return ok({ created: row });
    }
    if (type === "tag") {
      const [row] = await db.insert(tags).values({ name: name.toLowerCase() }).onConflictDoNothing().returning();
      if (!row) return fail("That tag already exists.");
      return ok({ created: row });
    }
    if (type === "collection") {
      const [row] = await db.insert(collections).values({ name, description: strOr(b.description), kind: b.kind === "playlist" ? "playlist" : "collection" }).returning();
      return ok({ created: row });
    }
    return fail("Unknown type.");
  } catch (e) { return fail(errMsg(e)); }
}

export async function PATCH(req: Request) {
  const denied = await guardMutation(req); if (denied) return denied;
  try {
    const b = await readBody(req);
    const id = intOr(b.id); if (!id) return fail("Missing id.");
    const name = strOr(b.name);
    const type = String(b.type ?? "");
    if (type === "category") {
      const patch: Partial<typeof categories.$inferInsert> = {};
      if (name) patch.name = name;
      if (b.parentId !== undefined) {
        const pid = intOr(b.parentId);
        if (pid === id) return fail("A category cannot be its own parent.");
        patch.parentId = pid;
      }
      const [row] = await db.update(categories).set(patch).where(eq(categories.id, id)).returning();
      return ok({ updated: row });
    }
    if (type === "tag") {
      if (!name) return fail("Name is required.");
      const [row] = await db.update(tags).set({ name: name.toLowerCase() }).where(eq(tags.id, id)).returning();
      return ok({ updated: row });
    }
    if (type === "collection") {
      const patch: Partial<typeof collections.$inferInsert> = {};
      if (name) patch.name = name;
      if (b.description !== undefined) patch.description = strOr(b.description);
      if (b.kind !== undefined) patch.kind = b.kind === "playlist" ? "playlist" : "collection";
      const [row] = await db.update(collections).set(patch).where(eq(collections.id, id)).returning();
      return ok({ updated: row });
    }
    return fail("Unknown type.");
  } catch (e) { return fail(errMsg(e)); }
}

export async function DELETE(req: Request) {
  const denied = await guardMutation(req); if (denied) return denied;
  try {
    const b = await readBody(req);
    const id = intOr(b.id); if (!id) return fail("Missing id.");
    const type = String(b.type ?? "");
    if (type === "category") {
      await db.update(categories).set({ parentId: null }).where(eq(categories.parentId, id));
      await db.delete(categories).where(eq(categories.id, id)); // videos keep existing, category set null by FK
    } else if (type === "tag") {
      await db.delete(tags).where(eq(tags.id, id));
    } else if (type === "collection") {
      await db.delete(collections).where(eq(collections.id, id));
    } else return fail("Unknown type.");
    return ok({ deleted: true });
  } catch (e) { return fail(errMsg(e)); }
}