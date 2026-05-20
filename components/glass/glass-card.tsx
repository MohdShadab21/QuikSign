"use client";

import { Card } from "@/components/ui/card";
import { ReactNode } from "react";

type GlassCardProps = {
  children: ReactNode;
  className?: string;
};

/** @deprecated Use Card or SectionCard — kept for gradual migration. */
export function GlassCard({ children, className }: GlassCardProps) {
  return (
    <Card className={className} padding="lg">
      {children}
    </Card>
  );
}
