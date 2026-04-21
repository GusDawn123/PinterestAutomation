import * as React from "react";
import { cn } from "../lib/cn";

export function PageContainer({
  children,
  className,
  size = "default",
}: {
  children: React.ReactNode;
  className?: string;
  size?: "default" | "narrow" | "wide";
}) {
  const max =
    size === "narrow" ? "max-w-2xl" : size === "wide" ? "max-w-6xl" : "max-w-4xl";
  return (
    <div className={cn("mx-auto w-full px-4 py-6 sm:px-6 sm:py-8", max, className)}>
      {children}
    </div>
  );
}
