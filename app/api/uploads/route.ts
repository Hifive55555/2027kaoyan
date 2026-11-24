import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { storeImageUpload } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserApi();
    if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "没有文件" }, { status: 400 });
    const stored = await storeImageUpload(auth.userId, file);
    return Response.json({ path: stored.path, name: stored.fileName });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "上传失败" }, { status: 500 });
  }
}
