import { reactive } from "vue"

import { ApiError, api, type AccountUser } from "./api"

export const account = reactive({
  user: null as AccountUser | null,
  checked: false,
  error: "",
})

export async function refreshAccount() {
  try {
    const result = await api<{ user: AccountUser }>("/me")
    account.user = result.user
    account.error = ""
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      account.user = null
      account.error = ""
    } else {
      account.error =
        error instanceof Error ? error.message : "Account status could not be checked."
      throw error
    }
  } finally {
    account.checked = true
  }
}

export function setAccountUser(user: AccountUser | null) {
  account.user = user
  account.checked = true
  account.error = ""
}
