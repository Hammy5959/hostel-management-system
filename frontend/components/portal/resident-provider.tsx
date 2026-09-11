"use client"

import { createContext, useContext } from "react"
import { useQuery } from "@tanstack/react-query"

import { getMyResident } from "@/lib/api"
import type { Resident } from "@/lib/types"

interface MyResidentValue {
  resident: Resident | undefined
  isLoading: boolean
  error: unknown
  refetch: () => void
}

const MyResidentContext = createContext<MyResidentValue | null>(null)

/** Fetches the caller's own resident record once near the Resident Portal
 * root and exposes it to every portal page — avoids each page re-fetching
 * GET /residents/me independently. react-query dedupes/caches this the same
 * way other resident fetches already do (see app.residents.service /
 * lib/api.ts's getResident). */
export function PortalResidentProvider({ children }: { children: React.ReactNode }) {
  const query = useQuery({ queryKey: ["my-resident"], queryFn: getMyResident })

  return (
    <MyResidentContext.Provider
      value={{
        resident: query.data,
        isLoading: query.isLoading,
        error: query.error,
        refetch: () => void query.refetch(),
      }}
    >
      {children}
    </MyResidentContext.Provider>
  )
}

export function useMyResident(): MyResidentValue {
  const ctx = useContext(MyResidentContext)
  if (!ctx) {
    throw new Error("useMyResident must be used within PortalResidentProvider")
  }
  return ctx
}
