"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { ignoreRecurring, resetRecurring } from "@/app/actions";
import { Button } from "@/components/ui/button";

type Direction = "out" | "in";

/** Tells the detector that this merchant is not a recurring payment. */
export function IgnoreRecurringButton({
  merchantKey,
  direction,
  merchant,
}: {
  merchantKey: string;
  direction: Direction;
  merchant: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await ignoreRecurring(merchantKey, direction);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`${merchant} is no longer treated as recurring`, {
            action: {
              label: "Undo",
              onClick: () => void resetRecurring(merchantKey, direction),
            },
          });
        })
      }
    >
      Not recurring
    </Button>
  );
}

/** Removes the user's decision so that automatic detection applies again. */
export function RestoreRecurringButton({
  merchantKey,
  direction,
  label = "Restore",
}: {
  merchantKey: string;
  direction: Direction;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await resetRecurring(merchantKey, direction);
          if (!result.ok) toast.error(result.error);
        })
      }
    >
      {label}
    </Button>
  );
}
