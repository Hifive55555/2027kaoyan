"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function Button({
  children, className, variant = "primary", size = "md", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "soft" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-[15px]",
        variant === "primary" && "bg-ink text-paper hover:opacity-90",
        variant === "ghost" && "text-muted hover:bg-hover hover:text-ink",
        variant === "outline" && "border border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-2",
        variant === "soft" && "bg-brand-soft text-brand hover:bg-brand-soft",
        variant === "danger" && "bg-accent-soft text-accent hover:bg-accent-soft",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium", className)}>
      {children}
    </span>
  );
}

export function Card({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <div id={id} className={cn("rounded-2xl border border-line bg-surface", className)}>{children}</div>;
}

export function Progress({ value, max = 100, className }: { value: number; max?: number; className?: string }) {
  const p = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-track", className)}>
      <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${p}%` }} />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

export function EmptyState({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
      <p className="font-serif text-lg text-ink">{title}</p>
      {desc && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{desc}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="font-serif text-lg tracking-tight text-ink">{children}</h2>
      {action}
    </div>
  );
}
