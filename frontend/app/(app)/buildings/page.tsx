import type { Metadata } from "next"

import { BuildingsView } from "@/components/buildings/buildings-view"

export const metadata: Metadata = {
  title: "Buildings",
}

export default function BuildingsPage() {
  return <BuildingsView />
}
