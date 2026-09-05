import type { LucideIcon } from "lucide-react"
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
} from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

export interface NavGroup {
  id: string
  label: string
  icon: LucideIcon
  items: NavItem[]
}

export interface NavLink {
  label: string
  href: string
  icon: LucideIcon
}

export type NavEntry =
  | { type: "link"; data: NavLink }
  | { type: "group"; data: NavGroup }

export const navigation: NavEntry[] = [
  { type: "link", data: { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard } },

  {
    type: "group",
    data: {
      id: "hostel",
      label: "Hostel Management",
      icon: Building2,
      items: [
        { label: "Buildings", href: "/buildings", icon: Building2 },
        { label: "Floors", href: "/floors", icon: Layers },
        { label: "Rooms", href: "/rooms", icon: DoorOpen },
        { label: "Allocations", href: "/allocations", icon: Users },
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
        { label: "Residents", href: "/residents", icon: UserRound },
        { label: "Admissions", href: "/admissions", icon: ClipboardPlus },
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
        { label: "Daily Attendance", href: "/attendance", icon: CalendarCheck },
        { label: "Leave Requests", href: "/leave-requests", icon: CalendarDays },
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
        { label: "Visitors", href: "/visitors", icon: Users },
        { label: "Gate Passes", href: "/gate-passes", icon: BadgeCheck },
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
        { label: "Fee Structures", href: "/fee-structures", icon: Banknote },
        { label: "Resident Charges", href: "/resident-charges", icon: Receipt },
        { label: "Invoices", href: "/invoices", icon: Receipt },
        { label: "Payments", href: "/payments", icon: CreditCard },
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
        { label: "Maintenance", href: "/maintenance", icon: Wrench },
        { label: "Inventory", href: "/inventory", icon: Package },
        { label: "Assets", href: "/assets", icon: Landmark },
      ],
    },
  },

  { type: "link", data: { label: "Mess Menus & Meals", href: "/mess-menus-meals", icon: UtensilsCrossed } },

  { type: "link", data: { label: "Notices", href: "/notices", icon: Megaphone } },

  { type: "link", data: { label: "Reports", href: "/reports", icon: BarChart3 } },
  { type: "link", data: { label: "Audit Logs", href: "/audit-logs", icon: FileClock } },

  {
    type: "group",
    data: {
      id: "user-management",
      label: "User Management",
      icon: UserCog,
      items: [
        { label: "Users", href: "/users", icon: Users },
        { label: "Staff", href: "/staff", icon: UserCog },
        { label: "Roles", href: "/roles", icon: ShieldCheck },
        { label: "Permissions", href: "/permissions", icon: KeyRound },
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
        { label: "Hostel Settings", href: "/settings", icon: SlidersHorizontal },
      ],
    },
  },
]
