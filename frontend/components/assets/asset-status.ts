import type { Tone } from "@/components/hostel/status-badge"
import type { AssetStatus } from "@/lib/types"

export const ASSET_STATUS_TONE: Record<AssetStatus, Tone> = {
  available: "success",
  assigned: "info",
  damaged: "warning",
  maintenance: "warning",
  lost: "danger",
  retired: "neutral",
}

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  available: "Available",
  assigned: "Assigned",
  damaged: "Damaged",
  maintenance: "Maintenance",
  lost: "Lost",
  retired: "Retired",
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
