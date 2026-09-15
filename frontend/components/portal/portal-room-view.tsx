"use client"

import { useState } from "react"

import { PageHeader } from "@/components/hostel/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RoomMyRoomTab } from "@/components/portal/room-my-room-tab"
import { RoomAttendanceTab } from "@/components/portal/room-attendance-tab"

const ROOM_TABS = ["room", "attendance"] as const
type RoomTab = (typeof ROOM_TABS)[number]

function isRoomTab(value: string | null | undefined): value is RoomTab {
  return !!value && (ROOM_TABS as readonly string[]).includes(value)
}

// Same underline-tab look as PortalFinancesView (TabsList variant="line"),
// not StubTabsPage's pill variant.
const TAB_TRIGGER_CLASS =
  "rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"

export function PortalRoomView({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<RoomTab>(isRoomTab(initialTab) ? initialTab : "room")

  return (
    <div className="space-y-6">
      <PageHeader title="My Room & Attendance" description="Your room allocation and attendance history." />

      <Tabs value={tab} onValueChange={(value) => isRoomTab(value) && setTab(value)}>
        <div className="border-b border-outline-variant">
          <TabsList variant="line" className="h-auto justify-start gap-8 bg-transparent p-0">
            <TabsTrigger value="room" className={TAB_TRIGGER_CLASS}>
              My Room
            </TabsTrigger>
            <TabsTrigger value="attendance" className={TAB_TRIGGER_CLASS}>
              Attendance
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="room" className="pt-6">
          <RoomMyRoomTab />
        </TabsContent>
        <TabsContent value="attendance" className="pt-6">
          <RoomAttendanceTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
