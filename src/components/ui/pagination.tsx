import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "./button";

/** Server-rendered pagination preserving the current query string. */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  searchParams,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "page") qs.set(k, v);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm text-muted-foreground no-print">
      <p>
        Showing <span className="font-medium text-foreground">{from}</span>–<span className="font-medium text-foreground">{to}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </p>
      <nav className="flex items-center gap-2" aria-label="Pagination">
        {page > 1 ? (
          <Link href={href(page - 1)} className={buttonClass("outline", "sm")} aria-label="Previous page">
            <ChevronLeft /> Prev
          </Link>
        ) : (
          <span className={buttonClass("outline", "sm", "opacity-50")} aria-disabled>
            <ChevronLeft /> Prev
          </span>
        )}
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={buttonClass("outline", "sm")} aria-label="Next page">
            Next <ChevronRight />
          </Link>
        ) : (
          <span className={buttonClass("outline", "sm", "opacity-50")} aria-disabled>
            Next <ChevronRight />
          </span>
        )}
      </nav>
    </div>
  );
}

export function pageParams(searchParams: Record<string, string | string[] | undefined>, pageSize = 20) {
  const raw = Number(typeof searchParams.page === "string" ? searchParams.page : 1);
  const page = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 10_000) : 1;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function sp(searchParams: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = searchParams[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 200) : undefined;
}
