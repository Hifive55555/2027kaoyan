"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PenLine, Library, History, Dices, Gamepad2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "今日", icon: Home },
  { href: "/practice", label: "刷题", icon: PenLine },
  { href: "/random", label: "随机", icon: Dices },
  { href: "/match", label: "比赛", icon: Gamepad2 },
  { href: "/tutor", label: "答疑", icon: MessageCircle },
  { href: "/history", label: "记录", icon: History },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-2/95 backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-6 px-1 pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map(item => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={cn("flex flex-col items-center gap-1 py-2.5 text-[10px]", active ? "text-brand" : "text-muted")}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.7} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
