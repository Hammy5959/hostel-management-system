import type { Metadata } from "next"
import { Suspense } from "react"

import { PaymentsView } from "@/components/payments/payments-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Payments",
}

export default function PaymentsPage() {
  return (
    <PageAccessGuard permission={["payments.view", "payments.view_own"]}>
      <Suspense>
        <PaymentsView />
      </Suspense>
    </PageAccessGuard>
  )
}
