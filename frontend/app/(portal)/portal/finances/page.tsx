import { StubTabsPage } from "@/components/portal/stub-tabs-page"

export default function PortalFinancesPage() {
  return (
    <StubTabsPage
      title="My Finances"
      description="Invoices, payments, and charges for your stay."
      tabs={[
        { value: "invoices", label: "Invoices" },
        { value: "payments", label: "Payments" },
        { value: "charges", label: "Charges" },
      ]}
    />
  )
}
