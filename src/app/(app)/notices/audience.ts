import { AUDIENCE_LABELS } from "@/lib/validation/notices";

export function audienceLabel(n: { audience: keyof typeof AUDIENCE_LABELS; class?: { name: string } | null; section?: { name: string; class: { name: string } } | null }) {
  if (n.audience === "CLASS" && n.class) return n.class.name;
  if (n.audience === "SECTION" && n.section) return `${n.section.class.name} – ${n.section.name}`;
  return AUDIENCE_LABELS[n.audience];
}
