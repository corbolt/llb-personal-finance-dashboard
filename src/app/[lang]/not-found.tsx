import { Compass } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/page";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t, link } = await getI18n();
  return (
    <Card>
      <EmptyState
        icon={Compass}
        title={t("notFound.title")}
        action={
          <Link href={link("/")} className={buttonClass({ variant: "primary" })}>
            {t("notFound.back")}
          </Link>
        }
      >
        {t("notFound.text")}
      </EmptyState>
    </Card>
  );
}
