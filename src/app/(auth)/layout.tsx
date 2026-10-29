import { CalendarCheck2, GraduationCap, ShieldCheck, Trophy } from "lucide-react";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth/actor";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getActor()) redirect("/dashboard");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[oklch(0.3_0.12_272)] p-12 text-white lg:flex lg:flex-col">
        <div aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full bg-[oklch(0.55_0.2_272)] opacity-40 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-16 size-96 rounded-full bg-[oklch(0.6_0.14_190)] opacity-30 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-white/15 backdrop-blur">
            <GraduationCap className="size-6" />
          </span>
          <span className="text-xl font-semibold">Scholaris</span>
        </div>
        <div className="relative mt-auto max-w-lg">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight text-balance">
            Everything your school runs on, in one calm place.
          </h2>
          <p className="mt-4 text-lg text-white/75">
            Attendance, timetables, assignments, examinations, fees and communication — for administrators, teachers, students and families.
          </p>
          <ul className="mt-10 grid gap-4 text-sm text-white/85">
            {[
              [CalendarCheck2, "Attendance in seconds, with trends and alerts"],
              [Trophy, "Marks, grades and printable report cards"],
              [ShieldCheck, "Role-based access and a full audit trail"],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof CalendarCheck2;
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-white/10">
                    <I className="size-4" />
                  </span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
      <main id="main" className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="size-5" />
            </span>
            <span className="text-lg font-semibold">Scholaris</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
