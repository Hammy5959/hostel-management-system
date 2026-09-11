"use client"

import { useState } from "react"
import { Construction } from "lucide-react"

import { PageHeader } from "@/components/hostel/page-header"
import { EmptyState } from "@/components/hostel/empty-state"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/** Minimal tabbed page shell shared by the Resident Portal's stub pages —
 * mirrors the Tabs/TabsList/TabsTrigger/TabsContent usage already
 * established in components/maintenance/maintenance-view.tsx (local
 * useState-driven tab, same UI primitives) so the real content built later
 * can drop into each TabsContent slot one at a time. */
export function StubTabsPage({
  title,
  description,
  tabs,
}: {
  title: string
  description?: string
  tabs: { value: string; label: string }[]
}) {
  const [tab, setTab] = useState(tabs[0]?.value)

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value} className="pt-6">
            <EmptyState
              icon={Construction}
              title={`${t.label} — coming soon`}
              description="This section is under construction."
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
