"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFormCtx } from "./action-form";

export const inputClass =
  "block w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs transition-colors " +
  "placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/20 " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15";

type FieldShellProps = {
  name: string;
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: (args: { id: string; invalid: boolean; describedBy?: string; onInput: () => void }) => ReactNode;
};

/** Label + control + hint + error message, wired with aria attributes. */
export function FieldShell({ name, label, hint, required, className, children }: FieldShellProps) {
  const id = useId();
  const { errors, clearError } = useFormCtx();
  const error = errors[name]?.[0];
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
          {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
        </label>
      )}
      {children({
        id,
        invalid: Boolean(error),
        describedBy: [hintId, errorId].filter(Boolean).join(" ") || undefined,
        onInput: () => clearError(name),
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type Common = { name: string; label?: ReactNode; hint?: ReactNode; containerClassName?: string };

export function TextField({ name, label, hint, containerClassName, className, required, ...props }: Common & ComponentProps<"input">) {
  return (
    <FieldShell name={name} label={label} hint={hint} required={required} className={containerClassName}>
      {({ id, invalid, describedBy, onInput }) => (
        <input
          id={id}
          name={name}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-required={required}
          onInput={onInput}
          className={cn(inputClass, props.type === "file" ? "py-2 file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm" : "h-10", className)}
          {...props}
        />
      )}
    </FieldShell>
  );
}

export function TextAreaField({ name, label, hint, containerClassName, className, required, ...props }: Common & ComponentProps<"textarea">) {
  return (
    <FieldShell name={name} label={label} hint={hint} required={required} className={containerClassName}>
      {({ id, invalid, describedBy, onInput }) => (
        <textarea
          id={id}
          name={name}
          rows={4}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-required={required}
          onInput={onInput}
          className={cn(inputClass, "py-2", className)}
          {...props}
        />
      )}
    </FieldShell>
  );
}

export type Option = { value: string; label: string; group?: string };

export function SelectField({
  name,
  label,
  hint,
  containerClassName,
  className,
  options,
  placeholder,
  required,
  ...props
}: Common & ComponentProps<"select"> & { options: Option[]; placeholder?: string }) {
  const groups = [...new Set(options.map((o) => o.group).filter(Boolean))] as string[];
  return (
    <FieldShell name={name} label={label} hint={hint} required={required} className={containerClassName}>
      {({ id, invalid, describedBy, onInput }) => (
        <select
          id={id}
          name={name}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-required={required}
          onInput={onInput}
          className={cn(inputClass, props.multiple ? "py-1.5" : "h-10 pr-8", className)}
          {...props}
        >
          {placeholder !== undefined && !props.multiple && <option value="">{placeholder}</option>}
          {groups.length
            ? groups.map((g) => (
                <optgroup key={g} label={g}>
                  {options
                    .filter((o) => o.group === g)
                    .map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                </optgroup>
              ))
            : options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
        </select>
      )}
    </FieldShell>
  );
}

export function CheckboxField({ name, label, hint, containerClassName, ...props }: Common & ComponentProps<"input">) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-3", containerClassName)}>
      <input id={id} type="checkbox" name={name} className="mt-0.5 size-4 rounded border-input accent-[var(--primary)]" {...props} />
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  className,
  pendingText,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormCtx();
  return (
    <Button type="submit" variant={variant} loading={pending} className={className}>
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>;
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 border-b py-6 first:pt-0 last:border-0 last:pb-0 lg:grid-cols-[220px_1fr]">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}
