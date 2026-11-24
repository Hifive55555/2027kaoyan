import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { requireUserApi } from "@/lib/auth";
import { getUploadOwner } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const auth = await requireUserApi();
  if (!auth) return new Response("Unauthorized", { status: 401 });
  const { file } = await ctx.params;
  const safe = path.basename(file);
  if (getUploadOwner(safe) !== auth.userId) return new Response("Not found", { status: 404 });
  const full = path.join(process.cwd(), "data/uploads", safe);
  try {
    const buf = await fs.readFile(full);
    const ext = path.extname(safe).toLowerCase();
    const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
