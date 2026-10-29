"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/forms/fields";

/** Updates one or more query params (resetting pagination) and navigates. */
function useUpdateParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in changes)) next.delete("page");
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { params, update, pending };
}

/** Debounced search box bound to `?q=`. */
export function SearchInput({ placeholder = "Search…", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const { params, update, pending } = useUpdateParams();
  const [value, setValue] = useState(params.get(param) ?? "");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      if ((params.get(param) ?? "") !== value.trim()) update({ [param]: value.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className={cn("absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground", pending && "animate-pulse")} aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(inputClass, "h-10 pl-9 pr-8")}
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Select bound to a query param. */
export function FilterSelect({
  param,
  options,
  placeholder = "All",
  label,
  className,
  fallback,
}: {
  param: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  label: string;
  className?: string;
  /** Value shown when the param is absent (the server-side default). */
  fallback?: string;
}) {
  const { params, update } = useUpdateParams();
  return (
    <select
      aria-label={label}
      value={params.get(param) ?? fallback ?? ""}
      onChange={(e) => update({ [param]: e.target.value || null })}
      className={cn(inputClass, "h-10 w-full pr-8 sm:w-auto", className)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Date input bound to a query param. */
export function DateParam({ param, label, className, fallback, max }: { param: string; label: string; className?: string; fallback?: string; max?: string }) {
  const { params, update } = useUpdateParams();
  return (
    <input
      type="date"
      aria-label={label}
      max={max}
      value={params.get(param) ?? fallback ?? ""}
      onChange={(e) => update({ [param]: e.target.value || null })}
      className={cn(inputClass, "h-10 w-full sm:w-auto", className)}
    />
  );
}

/** Clickable column header toggling `?sort=field&dir=asc|desc`. */
export function SortHeader({ field, label }: { field: string; label: string }) {
  const { params, update } = useUpdateParams();
  const active = params.get("sort") === field;
  const dir = active && params.get("dir") === "desc" ? "desc" : "asc";
  return (
    <button
      type="button"
      onClick={() => update({ sort: field, dir: active && dir === "asc" ? "desc" : "asc" })}
      className="inline-flex items-center gap-1 uppercase hover:text-foreground"
      aria-label={`Sort by ${label}${active ? (dir === "asc" ? ", ascending" : ", descending") : ""}`}
    >
      {label}
      <span aria-hidden className={cn("text-[10px]", !active && "opacity-30")}>
        {active && dir === "desc" ? "▼" : "▲"}
      </span>
    </button>
  );
}
