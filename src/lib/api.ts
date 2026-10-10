const apiBase = import.meta.env.VITE_API_BASE_URL || "/api"

export function apiUrl(path: string) {
  return `${apiBase}${path}`
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = "ApiError"
  }
}

export type AccountUser = {
  publicId: string
  accountType: "anonymous" | "registered" | "counselor"
  role: "anonymous" | "registered" | "counselor" | "superadmin"
  status: "active" | "suspended" | "deactivated"
  displayName: string | null
}

export type AuthResponse = {
  user: AccountUser
  recoveryCode?: string
  recoveryCodeWarning?: string
  application?: {
    publicRef: string
    status: string
    submittedAt: string
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set("Accept", "application/json")
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: "include",
  })
  if (response.status === 204) return undefined as T

  const payload: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Something went wrong."
    throw new ApiError(message, response.status)
  }
  return payload as T
}
