"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { ignoreRecurring, resetRecurring } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

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
  const { t } = useI18n();
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
            toast.error(t.error(result.error));
            return;
          }
          toast.success(t("recurring.noLonger", { merchant }), {
            action: {
              label: t("common.undo"),
              onClick: () => void resetRecurring(merchantKey, direction),
            },
          });
        })
      }
    >
      {t("recurring.notRecurring")}
    </Button>
  );
}

/** Removes the user's decision so that automatic detection applies again. */
export function RestoreRecurringButton({
  merchantKey,
  direction,
  label,
}: {
  merchantKey: string;
  direction: Direction;
  /** Defaults to "Restore". */
  label?: string;
}) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await resetRecurring(merchantKey, direction);
          if (!result.ok) toast.error(t.error(result.error));
        })
      }
    >
      {label ?? t("recurring.restore")}
    </Button>
  );
}
