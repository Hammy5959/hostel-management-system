import type { Metadata } from "next"
import { Suspense } from "react"

import { InventoryView } from "@/components/inventory/inventory-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Inventory",
}

export default function InventoryPage() {
  return (
    <PageAccessGuard permission="inventory_items.view">
      <Suspense>
        <InventoryView />
      </Suspense>
    </PageAccessGuard>
  )
}
