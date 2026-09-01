"use client";

import Link from "next/link";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/hostel/status-badge";
import type { Allocation } from "@/lib/types";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
        {label}
      </p>
      <div className="mt-1 text-sm text-on-surface">{value}</div>
    </div>
  );
}

export function AllocationDetailsDialog({
  open,
  onOpenChange,
  allocation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allocation: Allocation | null;
}) {
  const resident = allocation?.resident;
  const residentName = resident
    ? [resident.first_name, resident.last_name].filter(Boolean).join(" ")
    : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Allocation details</DialogTitle>
          <DialogDescription>
            Full record for this room allocation, including its current status
            and payment standing.
          </DialogDescription>
        </DialogHeader>

        {allocation && (
          <div className="grid grid-cols-2 gap-4">
            <DetailRow
              label="Resident"
              value={
                resident ? (
                  <Link
                    href={`/residents/${resident.id}`}
                    className="text-primary hover:underline"
                  >
                    {residentName}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <DetailRow label="Student ID" value={resident?.student_id ?? "—"} />
            <DetailRow
              label="Room"
              value={allocation.room?.room_number ?? "—"}
            />
            <DetailRow label="Bed" value={allocation.bed?.bed_number ?? "—"} />
            <DetailRow
              label="Allocated From"
              value={formatDate(allocation.allocated_from)}
            />
            {(allocation.status === "completed" ||
              allocation.status === "cancelled") && (
              <DetailRow label="Checked Out" value="✔" />
            )}
            <DetailRow
              label="Status"
              value={<StatusBadge status={allocation.status} />}
            />
            <DetailRow
              label="Payment"
              value={
                allocation.payment_status ? (
                  <StatusBadge
                    status={allocation.payment_status.status}
                    tone={
                      allocation.payment_status.status === "paid"
                        ? "success"
                        : allocation.payment_status.status === "no_dues"
                          ? "neutral"
                          : allocation.payment_status.status === "overdue"
                            ? "danger"
                            : "warning"
                    }
                  />
                ) : (
                  "—"
                )
              }
            />
            <div className="col-span-2">
              <DetailRow label="Reason" value={allocation.reason || "—"} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
