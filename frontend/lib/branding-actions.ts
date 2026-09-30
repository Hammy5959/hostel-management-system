"use server"

import { updateTag } from "next/cache"

import { BRANDING_CACHE_TAG } from "@/lib/public-branding"

/** Called after a successful Settings save so the next server render (any
 * user, incl. the login page) picks up the new name/logo/brand color
 * immediately instead of after the 60s cache window. Harmless if called by
 * anyone: it only forces a re-fetch of already-public data. */
export async function refreshBrandingCache(): Promise<void> {
  updateTag(BRANDING_CACHE_TAG)
}
