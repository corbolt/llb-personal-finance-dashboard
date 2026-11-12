"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { EmptyState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n/client";

export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card>
      <EmptyState
        icon={TriangleAlert}
        title={t("pageError.title")}
        action={
          <Button variant="primary" onClick={() => retry()}>
            {t("pageError.retry")}
          </Button>
        }
      >
        {t("pageError.text")}
      </EmptyState>
    </Card>
  );
}
