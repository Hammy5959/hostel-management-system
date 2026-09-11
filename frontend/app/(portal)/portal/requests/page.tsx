import { StubTabsPage } from "@/components/portal/stub-tabs-page"

export default function PortalRequestsPage() {
  return (
    <StubTabsPage
      title="My Requests"
      description="Leave requests, gate passes, complaints, and visitors."
      tabs={[
        { value: "leave", label: "Leave" },
        { value: "gate-passes", label: "Gate Passes" },
        { value: "complaints", label: "Complaints" },
        { value: "visitors", label: "Visitors" },
      ]}
    />
  )
}
