"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/server/action";
import { Button, type ButtonSize, type ButtonVariant } from "./button";
import { Dialog } from "./dialog";

/**
 * Button that asks for confirmation and then runs a server action (already bound to
 * its arguments). Used for destructive or significant operations.
 */
export function ConfirmAction({
  action,
  label,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "outline",
  confirmVariant = "danger",
  size = "md",
  icon,
  ariaLabel,
  redirectTo,
  children,
}: {
  action: () => Promise<ActionState>;
  label?: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  variant?: ButtonVariant;
  confirmVariant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  ariaLabel?: string;
  redirectTo?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function run() {
    start(async () => {
      const res = await action();
      if (res?.ok) {
        toast.success(res.message ?? "Done");
        setOpen(false);
        const to = res.redirectTo ?? redirectTo;
        if (to) router.push(to);
        else router.refresh();
      } else {
        toast.error(res?.message ?? "Something went wrong.");
      }
    });
  }

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} aria-label={ariaLabel}>
        {icon}
        {label}
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} title={title} size="sm">
        <div className="space-y-5">
          <div className="text-sm text-muted-foreground">{description}</div>
          {children}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant={confirmVariant} onClick={run} loading={pending}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
