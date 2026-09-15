import type { Metadata } from "next";
import { Suspense } from "react";

import { ReportsView } from "@/components/reports/reports-view";
import { PageAccessGuard } from "@/components/hostel/page-access-guard";

export const metadata: Metadata = { title: "Reports & Analytics" };

export default function ReportsPage() {
  return (
    <PageAccessGuard permission="reports.view">
      <Suspense>
        <ReportsView />
      </Suspense>
    </PageAccessGuard>
  );
}
