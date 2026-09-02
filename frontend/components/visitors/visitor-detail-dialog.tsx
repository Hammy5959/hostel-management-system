"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { StatusBadge, type Tone } from "@/components/hostel/status-badge"

import { markPermissionDenied, usePermissions } from "@/lib/permissions"
import { ApiError, updateVisitor } from "@/lib/api"
import type { Visitor, VisitorStatus } from "@/lib/types"

const VISITOR_STATUS_TONE: Record<VisitorStatus, Tone> = {
  expected: "info",
  checked_in: "success",
  checked_out: "neutral",
  cancelled: "neutral",
}

const VISITOR_STATUS_LABEL: Record<VisitorStatus, string> = {
  expected: "Expected",
  checked_in: "Checked In",
  checked_out: "Checked Out",
  cancelled: "Cancelled",
}

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-on-surface-variant">{label}</span>
      <span className="text-right font-medium text-on-surface">{value}</span>
    </div>
  )
}

export function VisitorDetailDialog({
  open,
  onOpenChange,
  visitor,
  residentName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  visitor: Visitor | null
  residentName: string
}) {
  const { has } = usePermissions()
  const queryClient = useQueryClient()
  const [toggling, setToggling] = useState(false)

  const canManage = has("visitors.create")

  async function toggleBlacklist(next: boolean) {
    if (!visitor) return
    setToggling(true)
    try {
      await updateVisitor(visitor.id, { is_blacklisted: next })
      toast.success(next ? "Visitor blacklisted." : "Visitor removed from blacklist.")
      queryClient.invalidateQueries({ queryKey: ["visitors"] })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("visitors.create")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setToggling(false)
    }
  }

  if (!visitor) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle>{visitor.visitor_name}</DialogTitle>
            <StatusBadge
              status={visitor.status}
              tone={VISITOR_STATUS_TONE[visitor.status]}
              label={VISITOR_STATUS_LABEL[visitor.status]}
            />
          </div>
          <DialogDescription>Visitor details and record.</DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-outline-variant">
          <DetailRow label="Visiting" value={residentName} />
          <DetailRow label="Phone" value={visitor.visitor_phone ?? "—"} />
          <DetailRow label="Relationship" value={visitor.relationship ?? "—"} />
          <DetailRow label="Purpose" value={visitor.purpose ?? "—"} />
          <DetailRow label="Expected At" value={formatDateTime(visitor.expected_at)} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
          <div>
            <p className="text-sm font-medium text-on-surface">Blacklisted</p>
            <p className="text-xs text-on-surface-variant">
              Blacklisted visitors cannot be checked in.
            </p>
          </div>
          <Switch
            checked={visitor.is_blacklisted}
            disabled={!canManage || toggling}
            onCheckedChange={(checked) => toggleBlacklist(checked === true)}
            aria-label="Toggle blacklist"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
