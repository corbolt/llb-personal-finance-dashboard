import { Compass } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/page";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <Card>
      <EmptyState
        icon={Compass}
        title="Page not found"
        action={
          <Link href="/" className={buttonClass({ variant: "primary" })}>
            Back to the overview
          </Link>
        }
      >
        There is nothing at this address.
      </EmptyState>
    </Card>
  );
}
