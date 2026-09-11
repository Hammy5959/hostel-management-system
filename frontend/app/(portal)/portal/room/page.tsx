import { StubTabsPage } from "@/components/portal/stub-tabs-page"

export default function PortalRoomPage() {
  return (
    <StubTabsPage
      title="My Room & Attendance"
      description="Your room allocation and attendance history."
      tabs={[
        { value: "room", label: "My Room" },
        { value: "attendance", label: "Attendance" },
      ]}
    />
  )
}
