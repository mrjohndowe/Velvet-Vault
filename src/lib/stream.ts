import fs from "fs";
import { Readable } from "stream";
import path from "path";
import { mimeFor } from "./util";

/**
 * Efficient HTTP byte-range streaming: never loads the file into memory.
 * Caller is responsible for authorization BEFORE calling this.
 */
export function streamFile(req: Request, filePath: string): Response {
  let st: fs.Stats;
  try { st = fs.statSync(filePath); } catch {
    return Response.json({ error: "File is missing or inaccessible on disk." }, { status: 404 });
  }
  if (!st.isFile()) return Response.json({ error: "Not a file." }, { status: 400 });
  const size = st.size;
  const type = mimeFor(path.extname(filePath).slice(1));
  const base: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": `inline; filename="${path.basename(filePath).replace(/["\\\r\n]/g, "")}"`,
    "X-Content-Type-Options": "nosniff",
  };
  if (req.method === "HEAD") return new Response(null, { status: 200, headers: { ...base, "Content-Length": String(size) } });

  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m && (m[1] || m[2])) {
      let start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10);
      let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
      start = Math.max(0, start);
      end = Math.min(end, size - 1);
      if (isNaN(start) || isNaN(end) || start > end || start >= size) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
      const nodeStream = fs.createReadStream(filePath, { start, end });
      return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
        status: 206,
        headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
      });
    }
  }
  const nodeStream = fs.createReadStream(filePath);
  return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
    status: 200, headers: { ...base, "Content-Length": String(size) },
  });
}