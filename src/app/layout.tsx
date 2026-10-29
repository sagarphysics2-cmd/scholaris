import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "@fontsource-variable/inter";
import "./globals.css";
import { themeScript } from "@/components/layout/theme-toggle";
import { ServiceWorker } from "@/components/layout/service-worker";

export const metadata: Metadata = {
  title: { default: "Scholaris — School Management", template: "%s · Scholaris" },
  description: "Students, teachers, attendance, timetables, exams, fees and communication — in one place.",
  applicationName: "Scholaris",
  appleWebApp: { capable: true, title: "Scholaris", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }],
    apple: "/icons/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#161a2b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">
          Skip to content
        </a>
        {children}
        <Toaster richColors closeButton position="top-right" toastOptions={{ className: "font-sans" }} />
        <ServiceWorker />
      </body>
    </html>
  );
}
