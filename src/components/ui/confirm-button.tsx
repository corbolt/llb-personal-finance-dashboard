"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Button, type ButtonStyle } from "./button";

/**
 * A button for destructive actions that asks once more in place: the first
 * click arms it, the second (within a few seconds) runs the action.
 */
export function ConfirmButton({
  onConfirm,
  confirmLabel = "Click again to confirm",
  disabled,
  children,
  ...style
}: {
  onConfirm: () => void;
  confirmLabel?: string;
  disabled?: boolean;
  children: ReactNode;
} & ButtonStyle) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      {...style}
      variant={armed ? "danger" : style.variant}
      disabled={disabled}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
