import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Welcome back. Enter your school account details.</p>
      <div className="mt-8">
        <LoginForm next={next} />
      </div>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        New staff, students and parents receive an invitation email from their school.
      </p>
    </div>
  );
}
