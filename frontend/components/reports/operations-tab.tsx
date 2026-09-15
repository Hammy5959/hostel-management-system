"use client";

import type { LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge, CalendarClock, DoorClosed, UserCheck, Wrench } from "lucide-react";

import {
  getAttendanceReport,
  getGatePassesReport,
  getLeaveReport,
  getMaintenanceReport,
  getVisitorsReport,
} from "@/lib/api";
import { ErrorState } from "@/components/hostel/error-state";
import { Skeleton } from "@/components/ui/skeleton";

type Tile = { label: string; value: number | undefined; tone?: "danger" | "warning" | "default" };

function GroupCard({
  title,
  icon: Icon,
  borderClassName,
  tiles,
  span,
}: {
  title: string;
  icon: LucideIcon;
  borderClassName: string;
  tiles: Tile[];
  span?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border-t-4 border-x border-b border-outline-variant bg-surface-container-lowest p-6 shadow-sm ${borderClassName} ${span ? "xl:col-span-2" : ""}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-on-surface">{title}</h3>
        <div className="flex size-9 items-center justify-center rounded-lg bg-surface-container text-primary">
          <Icon aria-hidden className="size-5" />
        </div>
      </div>
      <div className={`grid gap-3 ${tiles.length > 4 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}>
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg bg-surface-container-low p-3">
            <span className="text-xs text-on-surface-variant">{tile.label}</span>
            {tile.value === undefined ? (
              <Skeleton className="mt-1 h-6 w-10" />
            ) : (
              <div
                className={`mt-1 text-xl font-bold ${
                  tile.tone === "danger" ? "text-error" : tile.tone === "warning" ? "text-amber-600" : "text-on-surface"
                }`}
              >
                {tile.value.toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function OperationsTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const params = { date_from: dateFrom || undefined, date_to: dateTo || undefined };

  const attendanceQuery = useQuery({
    queryKey: ["reports", "attendance", dateFrom, dateTo],
    queryFn: () => getAttendanceReport(params),
  });
  const leavesQuery = useQuery({
    queryKey: ["reports", "leaves", dateFrom, dateTo],
    queryFn: () => getLeaveReport(params),
  });
  const visitorsQuery = useQuery({
    queryKey: ["reports", "visitors", dateFrom, dateTo],
    queryFn: () => getVisitorsReport(params),
  });
  const gatePassesQuery = useQuery({
    queryKey: ["reports", "gate-passes", dateFrom, dateTo],
    queryFn: () => getGatePassesReport(params),
  });
  const maintenanceQuery = useQuery({
    queryKey: ["reports", "maintenance", dateFrom, dateTo],
    queryFn: () => getMaintenanceReport(params),
  });

  const isError =
    attendanceQuery.isError ||
    leavesQuery.isError ||
    visitorsQuery.isError ||
    gatePassesQuery.isError ||
    maintenanceQuery.isError;

  if (isError) {
    return (
      <ErrorState
        message="Couldn't load the operations report."
        onRetry={() => {
          attendanceQuery.refetch();
          leavesQuery.refetch();
          visitorsQuery.refetch();
          gatePassesQuery.refetch();
          maintenanceQuery.refetch();
        }}
      />
    );
  }

  const attendance = attendanceQuery.data;
  const leaves = leavesQuery.data;
  const visitors = visitorsQuery.data;
  const gatePasses = gatePassesQuery.data;
  const maintenance = maintenanceQuery.data;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      <GroupCard
        title="Attendance"
        icon={UserCheck}
        borderClassName="border-t-primary"
        tiles={[
          { label: "Present", value: attendance?.present, tone: "default" },
          { label: "Absent", value: attendance?.absent, tone: "danger" },
          { label: "Late", value: attendance?.late, tone: "warning" },
          { label: "Excused", value: attendance?.excused },
        ]}
      />
      <GroupCard
        title="Leaves"
        icon={CalendarClock}
        borderClassName="border-t-primary-container"
        tiles={[
          { label: "Pending", value: leaves?.pending, tone: "warning" },
          { label: "Approved", value: leaves?.approved },
          { label: "Rejected", value: leaves?.rejected, tone: "danger" },
          { label: "Completed", value: leaves?.completed },
        ]}
      />
      <GroupCard
        title="Visitors"
        icon={Badge}
        borderClassName="border-t-secondary"
        tiles={[
          { label: "Expected", value: visitors?.expected },
          { label: "Checked In", value: visitors?.checked_in },
          { label: "Checked Out", value: visitors?.checked_out },
        ]}
      />
      <GroupCard
        title="Gate Passes"
        icon={DoorClosed}
        borderClassName="border-t-primary"
        tiles={[
          { label: "Pending", value: gatePasses?.pending, tone: "warning" },
          { label: "Approved", value: gatePasses?.approved },
          { label: "Issued", value: gatePasses?.issued },
          { label: "Exited", value: gatePasses?.exited },
          { label: "Returned", value: gatePasses?.returned },
          { label: "Expired", value: gatePasses?.expired, tone: "danger" },
        ]}
      />
      <GroupCard
        title="Maintenance & Complaints"
        icon={Wrench}
        borderClassName="border-t-primary-container"
        span
        tiles={[
          { label: "Open Tickets", value: maintenance?.open_tickets, tone: "danger" },
          { label: "Assigned", value: maintenance?.assigned_tickets },
          { label: "In Progress", value: maintenance?.in_progress_tickets },
          { label: "Resolved Tickets", value: maintenance?.resolved_tickets },
          { label: "Open Complaints", value: maintenance?.open_complaints, tone: "danger" },
          { label: "Resolved Complaints", value: maintenance?.resolved_complaints },
        ]}
      />
    </div>
  );
}
