import type { Metadata } from "next"
import { Suspense } from "react"

import { SettingsView } from "@/components/settings/settings-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = { title: "Hostel Settings" }

export default function SettingsPage() {
  return (
    <PageAccessGuard permission="hostel_settings.view">
      <Suspense>
        <SettingsView />
      </Suspense>
    </PageAccessGuard>
  )
}
