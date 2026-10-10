import { computed, reactive } from "vue"

export type RequestStatus = "Pending" | "Accepted" | "Declined" | "Cancelled"

export type RequestRecord = {
  reference: string
  counselor: string
  topic: string
  need: string
  supportCategoryId: string | null
  description: string
  status: RequestStatus
  createdAt: string
}

const state = reactive({
  accessMode: "private" as "profile" | "private",
  need: "Prayer & spiritual growth",
  preferredCategoryId: "prayer-spiritual-growth" as string | null,
  browseAllCounselors: false,
  request: null as RequestRecord | null,
})

export function useApp() {
  const setAccessMode = (mode: "profile" | "private") => {
    state.accessMode = mode
  }

  const setNeed = (need: string, categoryId: string | null) => {
    state.need = need
    state.preferredCategoryId = categoryId
    state.browseAllCounselors = false
  }

  return {
    state,
    request: computed(() => state.request),
    setAccessMode,
    setNeed,
  }
}
