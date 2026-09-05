"use client"

import { useMemo, useState, type FormEvent } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, FileEdit, Megaphone, Pencil, Plus, Search, ShieldOff, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { Breadcrumbs } from "@/components/hostel/breadcrumbs"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { Pagination } from "@/components/hostel/pagination"
import { StatusBadge } from "@/components/hostel/status-badge"
import { ConfirmDialog } from "@/components/hostel/confirm-dialog"
import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import { ApiError, deleteNotice, getNotices, publishNotice, unpublishNotice } from "@/lib/api"
import type { Notice } from "@/lib/types"
import { NoticeFormDialog } from "@/components/notices/notice-form-dialog"

type StatusFilter = "all" | "published" | "drafts"

function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
}: {
  icon: typeof Megaphone
  iconClassName: string
  label: string
  value: number | undefined
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-on-surface-variant">{label}</h3>
        <div className={cn("flex size-10 items-center justify-center rounded-full", iconClassName)}>
          <Icon aria-hidden className="size-5" />
        </div>
      </div>
      {value === undefined ? (
        <Skeleton className="h-10 w-20" />
      ) : (
        <p className="text-[32px] leading-none font-bold text-on-surface">{value.toLocaleString()}</p>
      )}
    </div>
  )
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function NoticesView() {
  const { has } = usePermissions()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Notice | null>(null)
  const [deleting, setDeleting] = useState<Notice | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [pendingPublishId, setPendingPublishId] = useState<string | null>(null)

  const canCreate = has("notices.create")
  const canUpdate = has("notices.update")
  const canPublish = has("notices.publish")

  const isDraftsFilter = status === "drafts"

  // Total/Published are separate, filter-independent counts — NoticeList has
  // no summary object (unlike Invoices), so per_page:1 just reads `.total`
  // from two cheap requests; Drafts is derived, no third request needed.
  const totalQuery = useQuery({
    queryKey: ["notices-total"],
    queryFn: () => getNotices({ page: 1, per_page: 1 }),
  })
  const publishedQuery = useQuery({
    queryKey: ["notices-published-total"],
    queryFn: () => getNotices({ page: 1, per_page: 1, published_only: true }),
  })
  const totalCount = totalQuery.data?.total
  const publishedCount = publishedQuery.data?.total
  const draftCount = totalCount !== undefined && publishedCount !== undefined ? totalCount - publishedCount : undefined

  // GET /notices has no distinct-categories endpoint, so the Category filter's
  // options come from whatever real categories are actually in use, read off
  // a capped fetch — never hardcoded.
  const categoryOptionsQuery = useQuery({
    queryKey: ["notices-categories"],
    queryFn: () => getNotices({ page: 1, per_page: 100 }),
  })
  const categoryOptions = useMemo(() => {
    const items = categoryOptionsQuery.data?.items ?? []
    return [...new Set(items.map((n) => n.category).filter((c): c is string => !!c))].sort()
  }, [categoryOptionsQuery.data])

  // The backend only exposes `published_only` (force-published), not a
  // "drafts only" inverse — so Drafts fetches a larger batch, filters
  // is_published === false client-side, and paginates that filtered array
  // itself rather than trusting the server's unfiltered total/page for this
  // one filter state (which would otherwise show a misleading page footer).
  const query = useQuery({
    queryKey: ["notices", { page: isDraftsFilter ? 1 : page, perPage: isDraftsFilter ? 100 : perPage, category, status }],
    queryFn: () =>
      getNotices({
        page: isDraftsFilter ? 1 : page,
        per_page: isDraftsFilter ? 100 : perPage,
        category: category || undefined,
        published_only: status === "published" ? true : undefined,
      }),
  })

  const rawItems = query.data?.items ?? []
  // Title search has no backend param either — filtered client-side over
  // whatever page/batch was already fetched (a documented simplification,
  // same as the Drafts filter, rather than inventing a backend search param).
  const searchFiltered = search
    ? rawItems.filter((n) => n.title.toLowerCase().includes(search.toLowerCase()))
    : rawItems

  let items: Notice[]
  let total: number
  if (isDraftsFilter) {
    const drafts = searchFiltered.filter((n) => !n.is_published)
    total = drafts.length
    items = drafts.slice((page - 1) * perPage, page * perPage)
  } else {
    items = searchFiltered
    total = query.data?.total ?? 0
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(notice: Notice) {
    setEditing(notice)
    setFormOpen(true)
  }

  function invalidateNoticeQueries() {
    queryClient.invalidateQueries({ queryKey: ["notices"] })
    queryClient.invalidateQueries({ queryKey: ["notices-total"] })
    queryClient.invalidateQueries({ queryKey: ["notices-published-total"] })
    queryClient.invalidateQueries({ queryKey: ["notices-categories"] })
  }

  async function togglePublish(notice: Notice) {
    setPendingPublishId(notice.id)
    try {
      if (notice.is_published) {
        await unpublishNotice(notice.id)
        toast.success("Notice unpublished.")
      } else {
        await publishNotice(notice.id)
        toast.success("Notice published.")
      }
      invalidateNoticeQueries()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("notices.publish")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setPendingPublishId(null)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setIsDeleting(true)
    try {
      await deleteNotice(deleting.id)
      toast.success("Notice deleted.")
      invalidateNoticeQueries()
      setDeleting(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("notices.update")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const forbidden = query.error instanceof ApiError && query.error.code === "missing_permission"

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Notices" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">Notices</h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Create, publish, and manage official hostel announcements.
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={openCreate}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              Create Notice
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Megaphone} iconClassName="bg-primary/10 text-primary" label="Total Notices" value={totalCount} />
        <StatCard
          icon={CheckCircle2}
          iconClassName="bg-emerald-50 text-emerald-600"
          label="Published"
          value={publishedCount}
        />
        <StatCard icon={FileEdit} iconClassName="bg-surface-container-high text-on-surface-variant" label="Drafts" value={draftCount} />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm md:flex-row md:items-center">
        <form onSubmit={submitSearch} className="flex flex-1 items-center gap-2">
          <div className="relative w-full">
            <Search
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-on-surface-variant"
            />
            <Input
              value={searchInput}
              onChange={(e) => {
                const value = e.target.value
                setSearchInput(value)
                if (value.trim() === "") {
                  setPage(1)
                  setSearch("")
                }
              }}
              placeholder="Search by title…"
              aria-label="Search notices"
              className="h-10 rounded-lg pl-10 text-sm"
            />
          </div>
          <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
            Search
          </Button>
        </form>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Select
            value={category || "all"}
            onValueChange={(value) => {
              setCategory(!value || value === "all" ? "" : value)
              setPage(1)
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container sm:w-44">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={status}
            onValueChange={(value) => {
              if (value) {
                setStatus(value as StatusFilter)
                setPage(1)
              }
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="drafts">Drafts</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        {forbidden ? (
          <div className="p-4">
            <EmptyState
              icon={ShieldOff}
              title="You don't have access to Notices"
              description="Ask an administrator to grant you the notices.view permission."
            />
          </div>
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
          </div>
        ) : query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Megaphone}
              title="No notices found"
              description={
                search || category || status !== "all"
                  ? "No notices match your filters."
                  : "Create your first notice to get started."
              }
              action={canCreate ? { label: "Create Notice", onClick: openCreate } : undefined}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table className="w-full border-collapse text-left">
                <TableHeader>
                  <TableRow className="border-b border-outline-variant bg-background/60 hover:bg-background/60">
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Title
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Category
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Status
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Published
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Expires
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-right text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-outline-variant">
                  {items.map((notice) => (
                    <TableRow
                      key={notice.id}
                      className="group border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60"
                    >
                      <TableCell className="max-w-xs truncate px-6 py-4 font-medium text-on-surface">
                        {notice.title}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        {notice.category ? <Badge variant="outline">{notice.category}</Badge> : "—"}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <StatusBadge
                          status={notice.is_published ? "published" : "draft"}
                          tone={notice.is_published ? "success" : "neutral"}
                          label={notice.is_published ? "Published" : "Draft"}
                        />
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                        {formatDate(notice.published_at)}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                        {formatDate(notice.expires_at)}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {canUpdate && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Edit ${notice.title}`}
                              onClick={() => openEdit(notice)}
                              className="rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
                            >
                              <Pencil aria-hidden className="size-4" />
                            </Button>
                          )}
                          {canPublish && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={pendingPublishId === notice.id}
                              onClick={() => togglePublish(notice)}
                            >
                              {pendingPublishId === notice.id
                                ? "Working…"
                                : notice.is_published
                                  ? "Unpublish"
                                  : "Publish"}
                            </Button>
                          )}
                          {canUpdate && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Delete ${notice.title}`}
                              onClick={() => setDeleting(notice)}
                              className="rounded-full text-on-surface-variant hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 aria-hidden className="size-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Pagination
              page={page}
              perPage={perPage}
              total={total}
              onPageChange={setPage}
              onPerPageChange={(next) => {
                setPerPage(next)
                setPage(1)
              }}
            />
          </>
        )}
      </div>

      <NoticeFormDialog open={formOpen} onOpenChange={setFormOpen} notice={editing} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete notice"
        description={deleting ? `This will permanently delete "${deleting.title}".` : ""}
        confirmLabel="Delete"
        destructive
        loading={isDeleting}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
