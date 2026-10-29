"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { parseWith, type FieldErrors } from "@/lib/validation/form";
import type { ActionState } from "@/server/action";

type Ctx = { errors: FieldErrors; pending: boolean; clearError: (name: string) => void };
const FormCtx = createContext<Ctx>({ errors: {}, pending: false, clearError: () => {} });

export function useFormCtx() {
  return useContext(FormCtx);
}

export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type Props = Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  action: FormAction;
  /** Same Zod schema as the server — gives instant client-side feedback. */
  schema?: z.ZodType;
  onSuccess?: (state: NonNullable<ActionState>) => void;
  resetOnSuccess?: boolean;
  /** Suppress the success toast (e.g. when the caller shows its own UI). */
  silent?: boolean;
  children: ReactNode;
};

/**
 * Form wrapper around a server action.
 *  - Validates client-side with the shared schema before sending.
 *  - Keeps entered values on error (we dispatch manually, so React does not auto-reset).
 *  - Shows toasts, field errors, pending state; follows `redirectTo` or refreshes data.
 */
export function ActionForm({ action, schema, onSuccess, resetOnSuccess, silent, children, ...props }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, dispatch, pending] = useActionState(action, null);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const handled = useRef<number | null>(null);

  useEffect(() => {
    if (!state || handled.current === state.ts) return;
    handled.current = state.ts;
    if (state.ok) {
      if (state.message && !silent) toast.success(state.message);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      if (state.redirectTo) router.push(state.redirectTo);
      else router.refresh();
    } else if (state.message) {
      toast.error(state.message);
    }
    setClientErrors({});
  }, [state, onSuccess, resetOnSuccess, router, silent]);

  const errors = { ...(state && !state.ok ? state.fieldErrors : {}), ...clientErrors };

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (schema) {
      const res = parseWith(schema, fd);
      if (!res.success) {
        setClientErrors(res.fieldErrors);
        const first = Object.keys(res.fieldErrors)[0];
        const el = first ? e.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`) : null;
        el?.focus();
        if (!el || first === "_form") toast.error(res.fieldErrors[first ?? "_form"]?.[0] ?? "Please check the form.");
        return;
      }
    }
    setClientErrors({});
    startTransition(() => dispatch(fd));
  }

  const clearError = (name: string) =>
    setClientErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });

  return (
    <FormCtx.Provider value={{ errors, pending, clearError }}>
      <form ref={formRef} noValidate onSubmit={handleSubmit} {...props}>
        {errors._form && (
          <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {errors._form[0]}
          </div>
        )}
        {children}
      </form>
    </FormCtx.Provider>
  );
}
