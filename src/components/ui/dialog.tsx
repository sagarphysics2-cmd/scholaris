"use client";

import { X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonSize, type ButtonVariant } from "./button";

/**
 * Accessible modal built on the native <dialog> element: focus trapping, Escape to close
 * and inert background come for free from the browser.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on backdrop
      }}
      aria-labelledby="dialog-title"
      className={cn(
        "m-auto w-[calc(100%-1.5rem)] rounded-2xl border bg-card p-0 text-card-foreground shadow-2xl backdrop:animate-fade-in open:animate-fade-in",
        "max-h-[calc(100dvh-2rem)]",
        widths[size],
      )}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <h2 id="dialog-title" className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close dialog">
              <X />
            </Button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

const DialogCloseCtx = createContext<() => void>(() => {});
/** Lets content inside a ModalButton close it (e.g. after a successful form). */
export function useCloseDialog() {
  return useContext(DialogCloseCtx);
}

/** A button that opens a dialog with arbitrary content. */
export function ModalButton({
  label,
  title,
  description,
  children,
  variant = "primary",
  size = "md",
  dialogSize,
  icon,
  className,
  ariaLabel,
}: {
  label?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  dialogSize?: "sm" | "md" | "lg" | "xl";
  icon?: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} className={className} aria-label={ariaLabel}>
        {icon}
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} description={description} size={dialogSize}>
        <DialogCloseCtx.Provider value={() => setOpen(false)}>{children}</DialogCloseCtx.Provider>
      </Dialog>
    </>
  );
}
