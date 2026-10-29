import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Scholaris — School Management",
    short_name: "Scholaris",
    description: "Attendance, timetables, assignments, results, fees and notices for your school.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f8fc",
    theme_color: "#4f46e5",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Attendance", url: "/attendance", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Timetable", url: "/timetable", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Assignments", url: "/assignments", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
