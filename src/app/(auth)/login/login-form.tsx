"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton, TextField } from "@/components/forms/fields";
import { loginSchema } from "@/lib/validation/auth";
import { loginAction } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const [show, setShow] = useState(false);
  return (
    <ActionForm action={loginAction} schema={loginSchema} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <TextField name="email" type="email" label="Email" autoComplete="email" placeholder="you@school.edu" required autoFocus />
      <div className="relative">
        <TextField name="password" type={show ? "text" : "password"} label="Password" autoComplete="current-password" required className="pr-10" />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-1 top-[30px] grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </ActionForm>
  );
}
