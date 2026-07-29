import CONFIG from '@/blog.config'
import { Client } from '@notionhq/client'
import type { SupportedFetch } from '@notionhq/client/build/src/fetch-types'

const NOTION_REQUEST_INTERVAL_MS = 500
let notionRequestQueue: Promise<void> = Promise.resolve()
let nextNotionRequestAt = 0

async function waitForNotionRequestSlot(): Promise<void> {
  const scheduled = notionRequestQueue.then(async () => {
    const delay = Math.max(0, nextNotionRequestAt - Date.now())
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
    nextNotionRequestAt = Date.now() + NOTION_REQUEST_INTERVAL_MS
  })
  notionRequestQueue = scheduled.catch(() => undefined)
  return scheduled
}

const throttledFetch: SupportedFetch = async (url, init) => {
  await waitForNotionRequestSlot()
  return fetch(url, init)
}

export const notion = new Client({
  auth: process.env.NOTION_KEY,
  fetch: throttledFetch,
})
export const databaseId = CONFIG.NOTION_PAGE_ID
