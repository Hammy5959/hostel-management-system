"use client"

import { useState } from "react"

import { PageHeader } from "@/components/hostel/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProfileInfoTab } from "@/components/portal/profile-info-tab"
import { ProfileContactsTab } from "@/components/portal/profile-contacts-tab"

const PROFILE_TABS = ["profile", "contacts"] as const
type ProfileTab = (typeof PROFILE_TABS)[number]

function isProfileTab(value: string | null | undefined): value is ProfileTab {
  return !!value && (PROFILE_TABS as readonly string[]).includes(value)
}

// Same underline-tab look as PortalFinancesView (TabsList variant="line"),
// not StubTabsPage's pill variant.
const TAB_TRIGGER_CLASS =
  "rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"

export function PortalProfileView({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<ProfileTab>(isProfileTab(initialTab) ? initialTab : "profile")

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Your profile and emergency contacts." />

      <Tabs value={tab} onValueChange={(value) => isProfileTab(value) && setTab(value)}>
        <div className="border-b border-outline-variant">
          <TabsList variant="line" className="h-auto justify-start gap-8 bg-transparent p-0">
            <TabsTrigger value="profile" className={TAB_TRIGGER_CLASS}>
              Profile
            </TabsTrigger>
            <TabsTrigger value="contacts" className={TAB_TRIGGER_CLASS}>
              Emergency Contacts
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile" className="pt-6">
          <ProfileInfoTab />
        </TabsContent>
        <TabsContent value="contacts" className="pt-6">
          <ProfileContactsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
