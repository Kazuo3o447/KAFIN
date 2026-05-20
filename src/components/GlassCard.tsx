/**
 * GlassCard – Pilot-Style aus 1index.html (.glass-card).
 * Dünner Wrapper, optional mit Score-Strip-Variant.
 */
import type { ReactNode, HTMLAttributes } from "react";

type Variant = "default" | "green" | "yellow" | "red";

const STRIP: Record<Variant, string> = {
  default: "",
  green: "score-strip-green",
  yellow: "score-strip-yellow",
  red: "score-strip-red",
};

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  children?: ReactNode;
}

export function GlassCard({ variant = "default", className = "", children, ...rest }: Props) {
  const cls = ["glass-card", STRIP[variant], className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
