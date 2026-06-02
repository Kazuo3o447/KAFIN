/**
 * CollapsibleSection – wrapper für aufklappbare Detail-Sektionen.
 * Im Print-Mode (?print=1) immer offen.
 * Phase F.4
 */
"use client";
import React from "react";
import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  icon?: string;
  count?: number;
  defaultOpen?: boolean;
  isPrint?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  icon,
  count,
  defaultOpen = false,
  isPrint = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen || isPrint);
  const isOpen = open || isPrint;

  return (
    <section className="glass-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left focus:outline-none"
        aria-expanded={isOpen}
      >
        {icon && <span className="text-secondary-400 text-sm">{icon}</span>}
        <span className="text-sm font-medium text-secondary-200 flex-1">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-xs text-secondary-500">({count})</span>
          )}
        </span>
        {!isPrint && (
          <span className="text-secondary-500 text-xs ti-chevron-down transition-transform"
            style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
            ▾
          </span>
        )}
      </button>
      <div className={`collapsible-content px-4 pb-4 ${isOpen ? "block" : "hidden"}`}>
        {children}
      </div>
    </section>
  );
}
