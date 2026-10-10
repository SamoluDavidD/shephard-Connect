import { computed, reactive } from "vue"

import type { Role } from "../data"

export type RequestStatus = "Pending" | "Accepted" | "Declined" | "Cancelled"

export type RequestRecord = {
  reference: string

  counselor: string

  topic: string

  need: string

  description: string

  status: RequestStatus

  createdAt: string
}

export type Message = {
  id: number

  from: "seeker" | "counselor"

  text: string

  time: string
}

const initialMessages: Message[] = [
  {
    id: 1,

    from: "counselor",

    text: "Thank you for trusting me. Take your time—what feels most important to share today?",

    time: "10:12",
  },

  {
    id: 2,

    from: "seeker",

    text: "I’ve been carrying a lot of worry and I don’t know how to handle it well.",

    time: "10:14",
  },

  {
    id: 3,

    from: "counselor",

    text: "You don’t have to carry that alone. We can take this one step at a time.",

    time: "10:15",
  },
]

function loadRequest(): RequestRecord | null {
  try {
    const value = localStorage.getItem("sc-request")

    return value ? JSON.parse(value) as RequestRecord : null
  } catch {
    console.warn("Stored demo request was invalid and has been cleared.")

    localStorage.removeItem("sc-request")

    return null
  }
}

const state = reactive({
  demo: localStorage.getItem("sc-demo") === "true",

  role: "seeker" as Role,

  accessMode: "private" as "profile" | "private",

  need: "Prayer & spiritual growth",

  request: loadRequest(),

  messages: [...initialMessages],

  savedResources: ["peace"],

  journeyStage: 3,
})

export function useApp() {
  const request = computed(() => state.request)

  const setDemo = (value: boolean) => {
    state.demo = value

    localStorage.setItem("sc-demo", String(value))
  }

  const setRole = (role: Role) => {
    state.role = role
  }

  const setAccessMode = (mode: "profile" | "private") => {
    state.accessMode = mode
  }

  const setNeed = (need: string) => {
    state.need = need
  }

  const createRequest = (
    record: Omit<RequestRecord, "reference" | "status" | "createdAt">,
  ) => {
    state.request = {
      ...record,

      reference: `SC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,

      status: "Pending",

      createdAt: new Date().toISOString(),
    }

    localStorage.setItem("sc-request", JSON.stringify(state.request))
  }

  const updateRequest = (status: RequestStatus) => {
    if (!state.request) return

    state.request.status = status

    localStorage.setItem("sc-request", JSON.stringify(state.request))
  }

  const sendMessage = (
    text: string,

    from: Message["from"] = state.role === "counselor" ? "counselor" : "seeker",
  ) => {
    state.messages.push({
      id: Date.now(),

      from,

      text,

      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",

        minute: "2-digit",
      }),
    })
  }

  const toggleResource = (id: string) => {
    const index = state.savedResources.indexOf(id)

    if (index >= 0) state.savedResources.splice(index, 1)
    else state.savedResources.push(id)
  }

  const setJourneyStage = (stage: number) => {
    state.journeyStage = Math.max(0, Math.min(5, stage))
  }

  const resetDemo = () => {
    state.request = null

    state.messages = [...initialMessages]

    state.savedResources = ["peace"]

    state.journeyStage = 3

    localStorage.removeItem("sc-request")
  }

  return {
    state,

    request,

    setDemo,

    setRole,

    setAccessMode,

    setNeed,

    createRequest,

    updateRequest,

    sendMessage,

    toggleResource,

    setJourneyStage,

    resetDemo,
  }
}
