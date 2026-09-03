import type { Tone } from "@/components/hostel/status-badge"
import type { InventoryItem } from "@/lib/types"

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock"

/** `InventoryItemOut` has no stored status field — it's always derived from
 * quantity vs minimum_quantity, computed the same way everywhere this page
 * shows a status (stat cards, table rows, detail dialog). */
export function computeStockStatus(item: Pick<InventoryItem, "quantity" | "minimum_quantity">): StockStatus {
  if (item.quantity === 0) return "out_of_stock"
  if (item.quantity <= item.minimum_quantity) return "low_stock"
  return "in_stock"
}

export const STOCK_STATUS_TONE: Record<StockStatus, Tone> = {
  in_stock: "success",
  low_stock: "warning",
  out_of_stock: "danger",
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
}
