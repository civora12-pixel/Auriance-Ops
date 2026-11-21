import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";

export type FormDialogControl = {
  pending: boolean;
  setPending: (pending: boolean) => void;
  /** Closes straight away (after a save, or once the user confirmed). */
  close: () => void;
  /** Asks to close: goes through the close guard if the form set one. */
  requestClose: () => void;
  /**
   * Called when the user tries to close (tap outside, Escape, the X, Cancel).
   * Return false to keep the dialog open, for example to ask first.
   */
  setCloseGuard: (guard: (() => boolean) | undefined) => void;
};

/**
 * Dialog shell for the order forms. The body mounts fresh each time it opens
 * (so no stale input) and the dialog can't be dismissed while a save is running.
 */
export function FormDialog({
  open,
  onOpenChange,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  children: (control: FormDialogControl) => ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const guard = useRef<(() => boolean) | undefined>(undefined);
  const setCloseGuard = useCallback((g: (() => boolean) | undefined) => {
    guard.current = g;
  }, []);
  const requestClose = () => {
    if (pending) return;
    if (guard.current && !guard.current()) return;
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
    >
      <DialogContent
        className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto", className)}
        showCloseButton={!pending}
      >
        {children({
          pending,
          setPending,
          close: () => onOpenChange(false),
          requestClose,
          setCloseGuard,
        })}
      </DialogContent>
    </Dialog>
  );
}

/** A server error shown above the dialog buttons. */
export function FormAlert({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}
