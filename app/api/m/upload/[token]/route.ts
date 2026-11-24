import { NextRequest } from "next/server";
import { completeUploadTicket, getUploadTicketPublic, getUploadTicketUser } from "@/lib/queries";
import { storeImageUpload } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const ticket = getUploadTicketPublic(token);
    if (!ticket) return Response.json({ error: "二维码不存在" }, { status: 404 });
    if (ticket.status === "uploaded") return Response.json({ error: "图片已上传，请勿重复提交" }, { status: 409 });
    if (ticket.status === "expired") return Response.json({ error: "二维码已过期，请回电脑重新生成" }, { status: 410 });
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "没有文件" }, { status: 400 });
    const owner = getUploadTicketUser(token);
    if (!owner) return Response.json({ error: "二维码不存在" }, { status: 404 });
    const stored = await storeImageUpload(owner, file);
    if (!completeUploadTicket(token, stored.fileName)) {
      return Response.json({ error: "二维码已失效，请回电脑重新生成" }, { status: 410 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "上传失败" }, { status: 500 });
  }
}
