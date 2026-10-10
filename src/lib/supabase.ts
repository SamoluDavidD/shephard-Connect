import { createClient } from "@supabase/supabase-js"
import { projectId, publicAnonKey } from "../../utils/supabase/info"

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || `https://${projectId}.supabase.co`
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || publicAnonKey

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const apiBase =
  import.meta.env.VITE_API_BASE_URL ||
  `${supabaseUrl}/functions/v1/server/make-server-189e2c8f`

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error

  const headers = new Headers(init.headers)
  headers.set("Content-Type", "application/json")
  if (data.session?.access_token) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`)
  }

  const response = await fetch(`${apiBase}${path}`, { ...init, headers })
  const payload: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Something went wrong."
    throw new Error(message)
  }
  return payload as T
}
