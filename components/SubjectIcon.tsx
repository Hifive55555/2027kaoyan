import { Sigma, Languages, Landmark, Cpu } from "lucide-react";
import type { SubjectId } from "@/lib/types";

export function SubjectIcon({ id, className = "h-5 w-5" }: { id: SubjectId; className?: string }) {
  if (id === "math2") return <Sigma className={className} />;
  if (id === "english2") return <Languages className={className} />;
  if (id === "politics") return <Landmark className={className} />;
  return <Cpu className={className} />;
}
