import fs from "node:fs/promises";
import path from "node:path";
import { saveUpload } from "./queries";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export interface StoredUpload {
  fileName: string;
  path: string;
  mimeType: string;
}

/**
 * Validate and persist an answer image. Shared by the desktop file picker
 * and the phone QR upload flow so both enforce the same limits.
 */
export async function storeImageUpload(userId: string, file: File): Promise<StoredUpload> {
  if (!(file instanceof File)) throw new Error("没有文件");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("图片不能超过 8MB");
  const type = file.type || "image/jpeg";
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) {
    throw new Error("只支持 JPG / PNG / WebP 图片");
  }
  const ext = type.includes("png") ? ".png" : type.includes("webp") ? ".webp" : ".jpg";
  const dir = path.join(process.cwd(), "data/uploads");
  await fs.mkdir(dir, { recursive: true });
  const name = `${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}${ext}`;
  await fs.writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  saveUpload(userId, name);
  return { fileName: name, path: `/api/uploads/${name}`, mimeType: type };
}
