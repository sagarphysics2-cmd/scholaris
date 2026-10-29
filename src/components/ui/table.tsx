import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Responsive table: a normal table from `md` up; below that each row renders as a
 * stacked card, with cell labels taken from the `label` prop (data-label attribute).
 */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm max-md:block", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("max-md:hidden [&_tr]:border-b", className)} {...props} />;
}

export function TBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("max-md:block max-md:space-y-3 max-md:p-3 [&_tr:last-child]:border-0", className)} {...props} />;
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b transition-colors hover:bg-muted/50",
        "max-md:block max-md:rounded-lg max-md:border max-md:bg-card max-md:p-3 max-md:shadow-xs",
        className,
      )}
      {...props}
    />
  );
}

export function TH({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-10 whitespace-nowrap bg-muted/40 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, label, ...props }: ComponentProps<"td"> & { label?: string }) {
  return (
    <td
      data-label={label}
      className={cn(
        "px-4 py-3 align-middle",
        "max-md:flex max-md:items-center max-md:justify-between max-md:gap-4 max-md:px-0 max-md:py-1.5 max-md:text-right",
        label && "max-md:before:mr-auto max-md:before:text-left max-md:before:text-xs max-md:before:font-medium max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]",
        className,
      )}
      {...props}
    />
  );
}
