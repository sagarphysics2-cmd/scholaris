"use client";

import { Copy, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { ActionState } from "@/server/action";

/** Sends (or re-sends) a portal invitation. In dev (console mail) the link is shown so it can be shared. */
export function InviteButton({ action, label = "Send invite" }: { action: () => Promise<ActionState<{ link: string | null }>>; label?: string }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="outline"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await action();
            if (res?.ok) {
              toast.success(res.message ?? "Invitation sent.");
              if (res.data?.link) setLink(res.data.link);
            } else toast.error(res?.message ?? "Could not send the invitation.");
          })
        }
      >
        <Send /> {label}
      </Button>
      <Dialog open={Boolean(link)} onClose={() => setLink(null)} title="Invitation link" description="Email delivery is in console mode, so you can share this one-time link directly. It expires in 72 hours.">
        <div className="space-y-3">
          <code className="block break-all rounded-lg bg-muted p-3 text-xs">{link}</code>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                navigator.clipboard.writeText(link ?? "").then(() => toast.success("Link copied"));
              }}
            >
              <Copy /> Copy link
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
