import type { Metadata } from "next"
import { Suspense } from "react"

import { MessView } from "@/components/mess/mess-view"

export const metadata: Metadata = {
  title: "Mess Menus & Meals",
}

export default function MessMenusMealsPage() {
  return (
    <Suspense>
      <MessView />
    </Suspense>
  )
}
