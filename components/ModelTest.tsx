"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "./ui";

export function ModelTest() {
  const [state, setState] = useState<{ loading: boolean; ok?: boolean; ms?: number; error?: string }>({ loading: false });
  async function test() {
    setState({ loading: true });
    try {
      const res = await fetch("/api/health/model", { method: "POST" });
      const data = await res.json();
      setState({ loading: false, ok: res.ok && data.ok, ms: data.latencyMs, error: data.error });
    } catch (err) {
      setState({ loading: false, ok: false, error: err instanceof Error ? err.message : "连接失败" });
    }
  }
  return (
    <div>
      <Button variant="outline" size="sm" onClick={test} disabled={state.loading}>
        {state.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "测试模型连接"}
      </Button>
      {state.ok === true && <p className="mt-2 inline-flex items-center gap-1 text-[10px] text-brand"><CheckCircle2 className="h-3 w-3" /> 连接正常 · {state.ms} ms</p>}
      {state.ok === false && <p className="mt-2 inline-flex items-center gap-1 text-[10px] text-accent"><XCircle className="h-3 w-3" /> {state.error || "连接失败"}</p>}
    </div>
  );
}
