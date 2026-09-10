import type { Metadata } from "next"
import { Suspense } from "react"

import { MessView } from "@/components/mess/mess-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Mess Menus & Meals",
}

export default function MessMenusMealsPage() {
  return (
    <PageAccessGuard permission={["mess_menus.view", "meals.view"]}>
      <Suspense>
        <MessView />
      </Suspense>
    </PageAccessGuard>
  )
}
