import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock3, Smartphone } from "lucide-react";
import { getUploadTicketPublic } from "@/lib/queries";
import { MobileUploadClient } from "@/components/MobileUploadClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "上传手写答案 · 备考台",
  robots: { index: false, follow: false },
};

function Shell({ children, footer = "图片只用于当前答题页的 AI 批改，不会公开展示" }: { children: React.ReactNode; footer?: string }) {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-paper px-5 py-8">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <Link href="/" className="mb-8 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-serif text-[15px] text-paper">备</span>
          <span>
            <span className="block font-serif text-[15px] text-ink">备考台</span>
            <span className="block text-[9px] uppercase tracking-[0.18em] text-faint">Phone upload</span>
          </span>
        </Link>
        {children}
        <p className="mt-auto pt-8 text-center text-[9px] leading-4 text-faint">{footer}</p>
      </div>
    </main>
  );
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = getUploadTicketPublic(token);
  const isTutor = state?.questionId?.startsWith("tutor:") || false;
  const where = isTutor ? "答疑页" : "答题页";
  const footer = isTutor ? "图片只用于本次答疑，不会公开展示" : "图片只用于当前答题页的 AI 批改，不会公开展示";

  if (!state) {
    return (
      <Shell footer={footer}>
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-line bg-surface px-6 py-14 text-center">
          <AlertCircle className="h-8 w-8 text-accent" />
          <h1 className="mt-4 font-serif text-[19px] text-ink">链接无效</h1>
          <p className="mt-2 text-[12px] leading-6 text-muted">这个上传链接不存在，请回到电脑上的{where}重新生成二维码。</p>
        </div>
      </Shell>
    );
  }

  if (state.status === "uploaded") {
    return (
      <Shell footer={footer}>
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-brand/20 bg-brand-soft/40 px-6 py-14 text-center">
          <CheckCircle2 className="h-10 w-10 text-brand" />
          <h1 className="mt-4 font-serif text-[20px] text-ink">图片已发送</h1>
          <p className="mt-2 text-[12px] leading-6 text-muted">电脑端已经收到这张图片，可以关闭此页面继续{isTutor ? "答疑" : "作答"}。</p>
        </div>
      </Shell>
    );
  }

  if (state.status === "expired") {
    return (
      <Shell footer={footer}>
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-line bg-surface px-6 py-14 text-center">
          <Clock3 className="h-9 w-9 text-muted" />
          <h1 className="mt-4 font-serif text-[19px] text-ink">二维码已过期</h1>
          <p className="mt-2 text-[12px] leading-6 text-muted">请回到电脑上的{where}，重新点击「手机扫码」生成新的二维码。</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell footer={footer}>
      <div className="mb-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted">
        <Smartphone className="h-3.5 w-3.5 text-brand" /> 拍照上传
      </div>
      <h1 className="font-serif text-[23px] leading-tight text-ink">{isTutor ? "上传图片" : "上传手写答案"}</h1>
      <p className="mt-2 text-[12px] leading-6 text-muted">{isTutor ? "拍照或从相册选择，图片会附到电脑上的答疑消息里。" : "拍下写在纸上的解答，确认清晰后发送到电脑。支持拍照或从相册选择。"}</p>
      <div className="mt-6">
        <MobileUploadClient token={token} expiresAt={state.expiresAt} />
      </div>
    </Shell>
  );
}
