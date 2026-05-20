"use client";
/**
 * Toast – Pilot-Style aus 1index.html.
 * Singleton Store + Provider; Verwendung via `showToast(msg, level)`.
 */
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";

export type ToastLevel = "success" | "error" | "info" | "warning";

export interface ToastEntry {
  id: number;
  level: ToastLevel;
  message: string;
}

type Listener = (entries: ToastEntry[]) => void;

const listeners = new Set<Listener>();
let entries: ToastEntry[] = [];
let nextId = 1;

function emit() {
  for (const l of listeners) l(entries);
}

export function showToast(message: string, level: ToastLevel = "info", durationMs = 4000) {
  const id = nextId++;
  entries = [...entries, { id, level, message }];
  emit();
  setTimeout(() => {
    entries = entries.filter((e) => e.id !== id);
    emit();
  }, durationMs);
}

export function ToastHost() {
  const [state, setState] = useState<ToastEntry[]>(entries);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const l: Listener = (e) => setState([...e]);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    entries = entries.filter((e) => e.id !== id);
    emit();
  }, []);

  if (!mounted) return null;
  const target = document.getElementById("toast-root") ?? document.body;

  return createPortal(
    <>
      {state.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.level} animate-toast-in`}
          onClick={() => dismiss(t.id)}
          role="status"
        >
          {t.message}
        </div>
      ))}
    </>,
    target,
  );
}
