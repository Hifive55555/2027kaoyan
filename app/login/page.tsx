import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginClient } from "@/components/LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession();
  if (session?.kind === "user") redirect("/");
  if (session?.kind === "guest") redirect("/match");
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return <LoginClient next={safeNext} />;
}
