import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Banknote,
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardPlus,
  CreditCard,
  DoorOpen,
  FileClock,
  Inbox,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Layers,
  Megaphone,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UserRound,
  Users,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Gates visibility in the staff sidebar. Sourced 1:1 from the
   * permission(s) each page's PageAccessGuard checks. Omit to always show
   * (matches a page guarded with permission={null}, or entries with no
   * guard, like Dashboard). Never set this on residentNavigation entries —
   * filtering treats "no permission declared" as "always show", which is
   * what keeps the resident portal sidebar untouched by this filter. */
  permission?: string | string[];
  /** Staff-only. True for a nav entry whose page doesn't exist yet (no
   * route, so no PageAccessGuard to source a permission from) — hidden for
   * every role unconditionally. Deliberately separate from `permission` so
   * an unbuilt page is never confused with a permission the user lacks.
   * Drop this flag once the page ships. */
  unbuilt?: true;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export interface NavLink {
  label: string;
  href: string;
  icon: LucideIcon;
  /** See NavItem.permission — same contract for a top-level link. */
  permission?: string | string[];
  /** See NavItem.unbuilt — same contract for a top-level link. */
  unbuilt?: true;
}

export type NavEntry =
  | { type: "link"; data: NavLink }
  | { type: "group"; data: NavGroup };

export const navigation: NavEntry[] = [
  {
    type: "link",
    data: { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  },

  {
    type: "group",
    data: {
      id: "hostel",
      label: "Hostel Management",
      icon: Building2,
      items: [
        { label: "Buildings", href: "/buildings", icon: Building2, permission: "buildings.view" },
        { label: "Floors", href: "/floors", icon: Layers, permission: "floors.view" },
        { label: "Rooms", href: "/rooms", icon: DoorOpen, permission: "rooms.view" },
        {
          label: "Allocations",
          href: "/allocations",
          icon: Users,
          permission: ["allocations.view", "allocations.view_own"],
        },
      ],
    },
  },

  {
    type: "group",
    data: {
      id: "residents",
      label: "Residents & Admissions",
      icon: UserRound,
      items: [
        { label: "Residents", href: "/residents", icon: UserRound, permission: "residents.view" },
        {
          label: "Admissions",
          href: "/admissions",
          icon: ClipboardPlus,
          permission: ["admissions.view", "admissions.view_own"],
        },
      ],
    },
  },

  {
    type: "group",
    data: {
      id: "attendance",
      label: "Attendance & Leave",
      icon: CalendarClock,
      items: [
        {
          label: "Daily Attendance",
          href: "/attendance",
          icon: CalendarCheck,
          permission: ["attendance.view", "attendance.view_own"],
        },
        {
          label: "Leave Requests",
          href: "/leave-requests",
          icon: CalendarDays,
          permission: ["leave_requests.view", "leave_requests.view_own"],
        },
      ],
    },
  },

  {
    type: "group",
    data: {
      id: "visitors",
      label: "Visitors & Security",
      icon: ShieldCheck,
      items: [
        {
          label: "Visitors",
          href: "/visitors",
          icon: Users,
          permission: ["visitors.view", "visitors.view_own"],
        },
        {
          label: "Gate Passes",
          href: "/gate-passes",
          icon: BadgeCheck,
          permission: ["gate_passes.view", "gate_passes.view_own"],
        },
      ],
    },
  },

  {
    type: "group",
    data: {
      id: "finance",
      label: "Finance & Fees",
      icon: Banknote,
      items: [
        {
          label: "Fee Structures",
          href: "/fee-structures",
          icon: Banknote,
          permission: "fee_structures.view",
        },
        {
          label: "Resident Charges",
          href: "/resident-charges",
          icon: Receipt,
          permission: "resident_charges.view",
        },
        {
          label: "Invoices",
          href: "/invoices",
          icon: Receipt,
          permission: ["invoices.view", "invoices.view_own"],
        },
        {
          label: "Payments",
          href: "/payments",
          icon: CreditCard,
          permission: ["payments.view", "payments.view_own"],
        },
      ],
    },
  },

  {
    type: "group",
    data: {
      id: "maintenance",
      label: "Maintenance & Inventory",
      icon: Wrench,
      items: [
        {
          label: "Maintenance",
          href: "/maintenance",
          icon: Wrench,
          permission: "maintenance_tickets.view",
        },
        { label: "Inventory", href: "/inventory", icon: Package, permission: "inventory_items.view" },
        { label: "Assets", href: "/assets", icon: Landmark, permission: "assets.view" },
      ],
    },
  },

  {
    type: "link",
    data: {
      label: "Mess Menus & Meals",
      href: "/mess-menus-meals",
      icon: UtensilsCrossed,
      permission: ["mess_menus.view", "meals.view"],
    },
  },

  {
    type: "link",
    data: { label: "Notices", href: "/notices", icon: Megaphone },
  },

  {
    type: "link",
    data: { label: "Reports", href: "/reports", icon: BarChart3, unbuilt: true },
  },
  {
    type: "link",
    data: { label: "Audit Logs", href: "/audit-logs", icon: FileClock, unbuilt: true },
  },

  {
    type: "group",
    data: {
      id: "user-management",
      label: "User Management",
      icon: UserCog,
      items: [
        { label: "Users", href: "/users", icon: Users, permission: "users.view" },
        { label: "Staff", href: "/staff", icon: UserCog, permission: "staff.view" },
        {
          label: "Roles",
          href: "/roles",
          icon: ShieldCheck,
          permission: ["roles.view", "roles.manage"],
        },
        { label: "Permissions", href: "/permissions", icon: KeyRound, unbuilt: true },
      ],
    },
  },

  {
    type: "group",
    data: {
      id: "settings",
      label: "Settings",
      icon: Settings,
      items: [
        {
          label: "Hostel Settings",
          href: "/settings",
          icon: SlidersHorizontal,
          unbuilt: true,
        },
      ],
    },
  },
];

/** Resident Portal nav — separate from `navigation` (staff), threaded into
 * AppShell via its `navigation` prop by app/(portal)/layout.tsx. Flat
 * top-level links only (no groups), all real routes so Sidebar's existing
 * `pathname === href` active-highlighting works with no extra handling. */
export const residentNavigation: NavEntry[] = [
  {
    type: "link",
    data: { label: "Home", href: "/portal", icon: LayoutDashboard },
  },
  {
    type: "link",
    data: { label: "My Finances", href: "/portal/finances", icon: Banknote },
  },
  {
    type: "link",
    data: { label: "My Requests", href: "/portal/requests", icon: Inbox },
  },
  {
    type: "link",
    data: { label: "My Room & Attendance", href: "/portal/room", icon: DoorOpen },
  },
  {
    type: "link",
    data: { label: "Profile", href: "/portal/profile", icon: UserRound },
  },
];

function isNavEntryVisible(
  entry: { permission?: string | string[]; unbuilt?: true },
  has: (permission: string) => boolean,
  hasAny: (...permissions: string[]) => boolean,
): boolean {
  if (entry.unbuilt) return false;
  if (!entry.permission) return true;
  return Array.isArray(entry.permission)
    ? hasAny(...entry.permission)
    : has(entry.permission);
}

/** Filters a nav array down to entries the current user is allowed to see.
 * An entry with no `permission` is always shown; `unbuilt` entries are
 * always hidden. A group is dropped entirely once all of its items are
 * filtered out. Entries that declare neither field (e.g. every
 * `residentNavigation` entry) pass through unchanged. */
export function filterNavigation(
  entries: NavEntry[],
  has: (permission: string) => boolean,
  hasAny: (...permissions: string[]) => boolean,
): NavEntry[] {
  return entries.reduce<NavEntry[]>((visible, entry) => {
    if (entry.type === "link") {
      if (isNavEntryVisible(entry.data, has, hasAny)) visible.push(entry);
      return visible;
    }
    const items = entry.data.items.filter((item) => isNavEntryVisible(item, has, hasAny));
    if (items.length > 0) visible.push({ type: "group", data: { ...entry.data, items } });
    return visible;
  }, []);
}
