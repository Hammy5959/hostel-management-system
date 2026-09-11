import { StubTabsPage } from "@/components/portal/stub-tabs-page"

export default function PortalProfilePage() {
  return (
    <StubTabsPage
      title="Profile"
      description="Your profile, documents, and emergency contacts."
      tabs={[
        { value: "profile", label: "Profile" },
        { value: "documents", label: "Documents" },
        { value: "emergency-contacts", label: "Emergency Contacts" },
      ]}
    />
  )
}
