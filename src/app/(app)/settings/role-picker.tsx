"use client";

import { useRouter } from "next/navigation";
import { inputClass } from "@/components/forms/fields";

export function ActionFormRolePicker({ roles, active }: { roles: Array<{ id: string; name: string }>; active: string }) {
  const router = useRouter();
  return (
    <select aria-label="Role" value={active} onChange={(e) => router.push(`/settings?tab=roles&role=${e.target.value}`)} className={`${inputClass} h-9 w-56 pr-8`}>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </select>
  );
}
