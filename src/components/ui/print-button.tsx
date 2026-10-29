"use client";

import { Printer } from "lucide-react";
import { Button } from "./button";

export function PrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer /> {label}
    </Button>
  );
}
