<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRouter } from "vue-router"

import { api, type AccountUser } from "../lib/api"
import { account } from "../lib/account"
import Icon from "./Icon.vue"

type Notification = {
  id: string
  kind: string
  title: string
  message: string
  created_at: string
  read_at: string | null
}

const router = useRouter()
const notifications = ref<Notification[]>([])
const open = ref(false)
const loading = ref(false)
const error = ref("")
const unreadCount = computed(() => notifications.value.filter((item) => !item.read_at).length)
const label = computed(() =>
  unreadCount.value
    ? `Notifications, ${unreadCount.value} unread`
    : "Notifications",
)
let refreshTimer: ReturnType<typeof setInterval> | undefined

async function loadNotifications() {
  if (!account.user || !account.checked) return
  loading.value = true
  error.value = ""
  try {
    const result = await api<{ notifications: Notification[] }>("/notifications")
    notifications.value = result.notifications
  } catch (loadError) {
    error.value =
      loadError instanceof Error ? loadError.message : "Notifications could not be loaded."
  } finally {
    loading.value = false
  }
}

function notificationPath(kind: string, user: AccountUser) {
  if (kind === "counselor_application") return user.role === "superadmin" ? "/admin" : "/counselor-application"
  if (kind === "counselor_application_update") {
    return user.role === "superadmin" ? "/admin" : "/counselor-application"
  }
  if (kind === "counseling_request") return user.role === "counselor" ? "/counselor" : "/app"
  if (kind === "conversation_message") return "/counseling"
  return null
}

async function openNotification(notification: Notification) {
  const user = account.user
  if (!user) return
  if (!notification.read_at) {
    try {
      await api<void>(`/notifications/${encodeURIComponent(notification.id)}/read`, {
        method: "PATCH",
      })
      notification.read_at = new Date().toISOString()
    } catch (markError) {
      error.value =
        markError instanceof Error ? markError.message : "The notification could not be marked as read."
      return
    }
  }
  const path = notificationPath(notification.kind, user)
  open.value = false
  if (path) await router.push(path)
}

function handleWindowFocus() {
  void loadNotifications()
}

function toggleMenu() {
  open.value = !open.value
  if (open.value) void loadNotifications()
}

watch(
  () => account.user?.publicId,
  () => {
    notifications.value = []
    if (account.user) {
      void loadNotifications()
    }
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener("focus", handleWindowFocus)
  refreshTimer = setInterval(() => void loadNotifications(), 60_000)
})

onBeforeUnmount(() => {
  window.removeEventListener("focus", handleWindowFocus)
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="notification-menu">
    <button
      class="icon-button notification-trigger"
      type="button"
      :aria-label="label"
      :aria-expanded="open"
      aria-controls="notification-panel"
      @click="toggleMenu"
    >
      <Icon name="Bell" :size="20" />
      <span v-if="unreadCount" class="notification-count" aria-hidden="true">
        {{ unreadCount > 99 ? "99+" : unreadCount }}
      </span>
    </button>
    <section
      v-if="open"
      id="notification-panel"
      class="notification-panel"
      aria-label="Notifications"
    >
      <header class="notification-panel-header">
        <h2>Notifications</h2>
        <span>{{ unreadCount }} unread</span>
      </header>
      <p v-if="error" class="notification-error" role="alert">{{ error }}</p>
      <p v-if="loading && !notifications.length" class="notification-empty" role="status">
        Loading notifications…
      </p>
      <p v-else-if="!error && !notifications.length" class="notification-empty">
        You’re all caught up. New updates will appear here.
      </p>
      <ul v-if="notifications.length" class="notification-list">
        <li v-for="notification in notifications" :key="notification.id">
          <button
            type="button"
            class="notification-item"
            :class="{ 'notification-item-unread': !notification.read_at }"
            @click="openNotification(notification)"
          >
            <span class="notification-item-heading">
              <strong>{{ notification.title }}</strong>
              <i v-if="!notification.read_at" aria-label="Unread" />
            </span>
            <span>{{ notification.message }}</span>
            <time :datetime="notification.created_at">
              {{ new Date(notification.created_at).toLocaleString() }}
            </time>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
