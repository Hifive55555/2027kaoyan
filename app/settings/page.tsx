import fs from "node:fs";
import path from "node:path";
import { Database, KeyRound, Server, Shield } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ModelTest } from "@/components/ModelTest";
import { LogoutButton } from "@/components/LogoutButton";
import { Card } from "@/components/ui";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth";
import { allCorpusMeta } from "@/lib/corpus";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireUserPage();
  const userId = session.userId!;
  const db = getDb();
  const papers = (db.prepare("SELECT count(*) AS n FROM papers WHERE user_id = ?").get(userId) as any).n;
  const questions = (db.prepare("SELECT count(*) AS n FROM questions q JOIN papers p ON p.id=q.paper_id WHERE p.user_id = ?").get(userId) as any).n;
  const attempts = (db.prepare("SELECT count(*) AS n FROM attempts a JOIN papers p ON p.id=a.paper_id WHERE p.user_id = ?").get(userId) as any).n;
  const randoms = (db.prepare("SELECT count(*) AS n FROM random_attempts WHERE user_id = ?").get(userId) as any).n;
  const key = process.env.DEEPSEEK_API_KEY || "";
  const masked = key ? `${key.slice(0, 4)}…${key.slice(-4)}` : "未配置";
  const metas = allCorpusMeta();
  return (
    <AppShell>
      <div className="mx-auto max-w-[900px] px-5 py-8 lg:px-10 lg:py-12">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Settings</div>
        <h1 className="mt-2 font-serif text-[30px] leading-tight">设置与数据</h1>
        <p className="mt-1 text-sm text-muted">本地单用户模式，数据保存在项目内的 SQLite 文件。</p>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted"><Server className="h-4 w-4 text-brand" /> 模型</div>
            <div className="mt-3 space-y-2 text-[12px]">
              <div className="flex items-start justify-between gap-4"><span className="shrink-0 text-muted">服务</span><span className="min-w-0 text-right">DeepSeek</span></div>
              <div className="flex items-start justify-between gap-4"><span className="shrink-0 text-muted">模型</span><span className="min-w-0 break-all text-right font-mono text-[11px]">{process.env.DEEPSEEK_MODEL || "deepseek-flash"}</span></div>
              <div className="flex items-start justify-between gap-4"><span className="shrink-0 text-muted">Base URL</span><span className="min-w-0 break-all text-right font-mono text-[10px] text-muted">{process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"}</span></div>
              <div className="flex items-start justify-between gap-4"><span className="shrink-0 text-muted">密钥</span><span className="inline-flex min-w-0 items-center gap-1 text-right font-mono text-[10px]"><KeyRound className="h-3 w-3 shrink-0" /> {masked}</span></div>
            </div>
            <div className="mt-4"><ModelTest /></div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted"><Database className="h-4 w-4 text-brand" /> 本地数据</div>
            <div className="mt-3 space-y-2 text-[12px]">
              <div className="flex items-start justify-between gap-4"><span className="shrink-0 text-muted">试卷</span><span className="min-w-0 text-right">{papers} 份</span></div>
              <div className="flex items-start justify-between gap-4"><span className="shrink-0 text-muted">生成题目</span><span className="min-w-0 text-right">{questions} 题</span></div>
              <div className="flex items-start justify-between gap-4"><span className="shrink-0 text-muted">作答记录</span><span className="min-w-0 text-right">{attempts} 条</span></div>
              <div className="flex items-start justify-between gap-4"><span className="shrink-0 text-muted">随机刷题</span><span className="min-w-0 text-right">{randoms} 题</span></div>
              <div className="flex items-start justify-between gap-4"><span className="shrink-0 text-muted">当前账号</span><span className="min-w-0 truncate text-right">{session.displayName}</span></div>
              <div className="flex items-start justify-between gap-4"><span className="shrink-0 text-muted">数据库</span><span className="min-w-0 break-all text-right font-mono text-[10px]">data/app.db</span></div>
            </div>
            <p className="mt-4 text-[10px] leading-5 text-muted">清空或备份可直接操作 <code className="rounded bg-subtle px-1">data/app.db</code>。上传图片在 <code className="rounded bg-subtle px-1">data/uploads/</code>。</p>
            <div className="mt-3"><LogoutButton /></div>
          </Card>
        </div>

        <Card className="mt-4 p-5">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted"><Shield className="h-4 w-4 text-brand" /> 真题库覆盖</div>
          <div className="mt-3 divide-y divide-line text-[11px]">
            {metas.map(m => (
              <div key={m.subject} className="flex items-center justify-between py-2">
                <span className="text-ink">{m.name}</span>
                <span className="text-muted">{m.years[0]}—{m.years[m.years.length - 1]} · {m.years.length} 套{m.count ? ` · ${m.count} 题` : ""}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] leading-5 text-muted">
            来源见 <code className="rounded bg-subtle px-1">data/SOURCES.md</code>。材料仅用于个人学习；英语二参考译文/范文为 AI 生成，非官方答案。
          </p>
        </Card>

        <Card className="mt-4 p-5">
          <div className="text-[11px] font-medium text-ink">使用建议</div>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-muted">
            <li>· 每天 1 组小卷（8—12 题），比一次刷 50 题更容易坚持。</li>
            <li>· 主观题尽量写完整步骤，AI 才能按步骤给分；也可以上传手写照片。</li>
            <li>· 「做同类题」用于验证是否真会，不要在同一天重复同一道题。</li>
            <li>· 整卷模式题量大，建议周末完整计时做。</li>
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}
