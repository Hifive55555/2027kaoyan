"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertCircle, CheckCircle2, Clock3, Loader2, Smartphone, X } from "lucide-react";

export type PhoneUploadStatus = "creating" | "pending" | "uploaded" | "expired" | "error";

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function PhoneUploadModal({
  open, url, status, error, expiresAt, onClose,
}: {
  open: boolean;
  url: string;
  status: PhoneUploadStatus;
  error?: string;
  expiresAt?: string;
  onClose: () => void;
}) {
  const [remaining, setRemaining] = useState(() => expiresAt ? new Date(expiresAt).getTime() - Date.now() : 0);

  useEffect(() => {
    if (!open || !expiresAt) return;
    const tick = () => setRemaining(new Date(expiresAt).getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [open, expiresAt]);

  if (!open) return null;
  const localHost = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1f1d19]/45 p-4 backdrop-blur-[3px]" onClick={onClose}>
      <div
        className="w-full max-w-[390px] rounded-2xl border border-line bg-surface p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted">
              <Smartphone className="h-3.5 w-3.5 text-brand" /> Phone upload
            </div>
            <h2 className="mt-1.5 font-serif text-[19px] text-ink">手机扫码上传手写答案</h2>
            <p className="mt-1 text-[11px] leading-5 text-muted">用手机拍照，图片会直接传到当前这道题。</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-ink" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5">
          {status === "creating" && (
            <div className="flex h-[248px] flex-col items-center justify-center rounded-xl border border-line bg-surface-2">
              <Loader2 className="h-5 w-5 animate-spin text-brand" />
              <p className="mt-3 text-[11px] text-muted">正在生成二维码…</p>
            </div>
          )}

          {status === "pending" && url && (
            <>
              <div className="mx-auto w-fit rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                <QRCodeSVG value={url} size={204} level="M" marginSize={2} bgColor="#ffffff" fgColor="#171614" title="手机扫码上传" />
              </div>
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-muted">
                <Clock3 className="h-3 w-3" /> 二维码 {expiresAt ? formatRemaining(remaining) : "10 分钟"} 内有效
              </div>
              <p className="mt-2 text-center text-[10px] leading-5 text-faint">
                手机扫码后拍照或从相册选择，<br />上传成功后电脑会自动收到图片。
              </p>
              {localHost && (
                <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber/20 bg-amber-soft px-2.5 py-2 text-[10px] leading-4 text-amber">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  当前是 localhost，手机无法访问。请用电脑的局域网 IP 或线上域名打开本页后再扫码。
                </div>
              )}
            </>
          )}

          {status === "uploaded" && (
            <div className="flex h-[248px] flex-col items-center justify-center rounded-xl border border-brand/20 bg-brand-soft/40">
              <CheckCircle2 className="h-8 w-8 text-brand" />
              <p className="mt-3 text-[13px] font-medium text-ink">图片已收到</p>
              <p className="mt-1 text-[10px] text-muted">正在填入答题区…</p>
            </div>
          )}

          {status === "expired" && (
            <div className="flex h-[248px] flex-col items-center justify-center rounded-xl border border-line bg-surface-2 px-5 text-center">
              <Clock3 className="h-7 w-7 text-muted" />
              <p className="mt-3 text-[13px] font-medium text-ink">二维码已过期</p>
              <p className="mt-1 text-[10px] leading-5 text-muted">请关闭后重新点击「手机扫码」生成新的二维码。</p>
            </div>
          )}

          {status === "error" && (
            <div className="flex h-[248px] flex-col items-center justify-center rounded-xl border border-accent/20 bg-accent-soft px-5 text-center">
              <AlertCircle className="h-7 w-7 text-accent" />
              <p className="mt-3 text-[13px] font-medium text-ink">二维码生成失败</p>
              <p className="mt-1 text-[10px] leading-5 text-accent">{error || "请关闭后重试"}</p>
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-[9px] leading-4 text-faint">
          二维码只对当前账号和本题有效，过期自动失效
        </div>
      </div>
    </div>
  );
}
