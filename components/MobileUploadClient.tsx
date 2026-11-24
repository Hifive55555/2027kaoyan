"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, Loader2, RefreshCw, Upload } from "lucide-react";
import { compressImage } from "@/lib/image";

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function MobileUploadClient({ token, expiresAt }: { token: string; expiresAt: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(() => new Date(expiresAt).getTime() - Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const tick = () => setRemaining(new Date(expiresAt).getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const expired = remaining <= 0;

  async function upload() {
    if (!file || busy || expired) return;
    setBusy(true);
    setError("");
    try {
      const blob = await compressImage(file);
      const fd = new FormData();
      fd.append("file", blob, "answer.jpg");
      const res = await fetch(`/api/m/upload/${token}`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "上传失败");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-brand/20 bg-brand-soft/40 px-6 py-14 text-center">
        <CheckCircle2 className="h-10 w-10 text-brand" />
        <h2 className="mt-4 font-serif text-[20px] text-ink">已发送到电脑</h2>
        <p className="mt-2 text-[12px] leading-6 text-muted">可以关闭这个页面，回到电脑继续作答。</p>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { setFile(e.target.files?.[0] || null); setError(""); }}
      />

      {!file ? (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={expired}
          className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center transition-colors hover:border-brand/50 hover:bg-surface-2 disabled:opacity-50"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand"><Camera className="h-5 w-5" /></span>
          <span className="mt-4 text-[14px] font-medium text-ink">拍照 / 从相册选择</span>
          <span className="mt-1 text-[10px] text-muted">尽量拍正、拍清晰，避免反光</span>
        </button>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="待上传的解答" className="max-h-[45vh] w-full bg-sand object-contain" />
          <div className="flex items-center gap-2 border-t border-line p-3">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-[12px] text-muted hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> 重新选择
            </button>
            <button
              onClick={upload}
              disabled={busy || expired}
              className="inline-flex h-10 flex-[1.5] items-center justify-center gap-1.5 rounded-xl bg-ink text-[12px] font-medium text-paper disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {busy ? "上传中…" : "发送到电脑"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[10px] text-faint">
        <span>支持 JPG / PNG，≤ 8MB</span>
        <span className={expired ? "text-accent" : "text-muted"}>链接 {formatRemaining(remaining)} 后失效</span>
      </div>
      {error && <p className="mt-3 rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-[11px] leading-5 text-accent">{error}</p>}
      {!error && !file && <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-faint"><ImagePlus className="h-3 w-3" /> 上传后电脑端会自动填入答题区</div>}
    </div>
  );
}
