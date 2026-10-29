import { cn, initials } from "@/lib/utils";

const palette = [
  "bg-[oklch(0.9_0.06_272)] text-[oklch(0.4_0.15_272)]",
  "bg-[oklch(0.9_0.06_175)] text-[oklch(0.4_0.1_175)]",
  "bg-[oklch(0.92_0.07_75)] text-[oklch(0.45_0.11_60)]",
  "bg-[oklch(0.91_0.05_20)] text-[oklch(0.45_0.15_20)]",
  "bg-[oklch(0.91_0.05_230)] text-[oklch(0.42_0.11_230)]",
  "bg-[oklch(0.91_0.05_320)] text-[oklch(0.42_0.13_320)]",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name,
  fileId,
  size = "md",
  className,
}: {
  name: string;
  fileId?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-base", xl: "size-24 text-2xl" };
  if (fileId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served by the authorised file route
      <img
        src={`/api/files/${fileId}`}
        alt=""
        className={cn("shrink-0 rounded-full object-cover ring-2 ring-card", sizes[size], className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold ring-2 ring-card",
        palette[hash(name) % palette.length],
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
