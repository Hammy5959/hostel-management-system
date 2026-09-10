import type { Metadata } from "next"
import { Suspense } from "react"

import { InvoicesView } from "@/components/invoices/invoices-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Invoices",
}

export default function InvoicesPage() {
  return (
    <PageAccessGuard permission={["invoices.view", "invoices.view_own"]}>
      <Suspense>
        <InvoicesView />
      </Suspense>
    </PageAccessGuard>
  )
}
