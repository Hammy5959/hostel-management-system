import type { Metadata } from "next"

import { FloorsView } from "@/components/floors/floors-view"

export const metadata: Metadata = {
  title: "Floors",
}

export default function FloorsPage() {
  return <FloorsView />
}
