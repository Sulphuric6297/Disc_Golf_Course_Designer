// Short messages at the bottom of the map, with Undo where something was removed.
import { create } from "zustand";

export type Toast = { id: number; text: string; tone: "info" | "success" | "error"; undo: boolean; action?: { label: string; run: () => void } };

type ToastStore = { toasts: Toast[]; push: (t: Omit<Toast, "id">, ms: number) => void; dismiss: (id: number) => void };

let next = 1;
export const useToasts = create<ToastStore>()(set => ({
  toasts: [],
  push: (t, ms) => {
    const id = next++;
    set(s => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    window.setTimeout(() => set(s => ({ toasts: s.toasts.filter(x => x.id !== id) })), ms);
  },
  dismiss: id => set(s => ({ toasts: s.toasts.filter(x => x.id !== id) }))
}));

export const toast = (text: string, tone: Toast["tone"] = "info", undo = false, action?: Toast["action"], ms = 6000) =>
  useToasts.getState().push({ text, tone, undo, action }, ms);
