<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { api, apiUrl } from "../lib/api"
import { account, setAccountUser } from "../lib/account"
import BaseButton from "./BaseButton.vue"
import Brand from "./Brand.vue"
import Icon from "./Icon.vue"
import NotificationMenu from "./NotificationMenu.vue"
import ProfileAvatar from "./ProfileAvatar.vue"
import Notice from "./Notice.vue"

defineProps<{ title: string; eyebrow?: string }>()

const route = useRoute()
const router = useRouter()
const open = ref(false)
const logoutError = ref("")
const navigation = [
  { to: "/app", label: "Home", icon: "Home", roles: ["seeker"] },
  {
    to: "/counseling",
    label: "Counseling",
    icon: "MessageCircle",
    roles: ["seeker", "counselor"],
  },
  {
    to: "/guidance",
    label: "Guidance",
    icon: "BookOpen",
    roles: ["seeker", "counselor"],
  },
  { to: "/journey", label: "My journey", icon: "Sparkles", roles: ["seeker"] },
  {
    to: "/counselor",
    label: "Requests",
    icon: "HeartHandshake",
    roles: ["counselor"],
  },
  {
    to: "/counselor-application",
    label: "Application status",
    icon: "GraduationCap",
    roles: ["applicant"],
  },
  {
    to: "/admin",
    label: "Administration",
    icon: "ShieldCheck",
    roles: ["admin"],
  },
  { to: "/reports", label: "Reports", icon: "Users", roles: ["admin"] },
  { to: "/settings", label: "Account settings", icon: "Settings", roles: ["seeker", "counselor", "admin", "applicant"] },
]
const currentRole = computed(() => {
  if (
    account.user?.accountType === "counselor" &&
    account.user.role === "registered"
  ) return "applicant"
  if (account.user?.role === "counselor") return "counselor"
  if (account.user?.role === "superadmin") return "admin"
  return "seeker"
})
const pageAccess = computed(() => {
  const routeName = String(route.name || "")
  const protectedPages = new Set([
    "seeker-dashboard",
    "account-settings",
    "counselor-dashboard",
    "counselor-application",
    "counseling",
    "guidance",
    "journey",
    "admin",
    "reports",
  ])
  if (!protectedPages.has(routeName)) return "allowed"
  if (!account.checked) return "checking"
  if (!account.user) return "sign-in"
  if (
    account.user.accountType === "counselor" &&
    account.user.role === "registered" &&
    !["counselor-application", "account-settings"].includes(routeName)
  ) {
    return "denied"
  }
  if (
    routeName === "counselor-application" &&
    account.user.accountType !== "counselor"
  ) {
    return "denied"
  }
  if (
    ["seeker-dashboard", "journey"].includes(routeName) &&
    !["anonymous", "registered"].includes(account.user.role)
  ) {
    return "denied"
  }
  if (routeName === "counselor-dashboard" && account.user.role !== "counselor") {
    return "denied"
  }
  if (["admin", "reports"].includes(routeName) && account.user.role !== "superadmin") {
    return "denied"
  }
  if (
    routeName === "counseling" &&
    !["anonymous", "registered", "counselor"].includes(account.user.role)
  ) {
    return "denied"
  }
  return "allowed"
})
const items = computed(() =>
  navigation.filter((item) => item.roles.includes(currentRole.value)),
)

watch(
  () => route.path,
  () => {
    open.value = false
  },
)

function quickExit() {
  sessionStorage.clear()
  void router.replace("/safe")
}

async function signOut() {
  logoutError.value = ""
  try {
    await api<void>("/auth/logout", { method: "POST" })
    setAccountUser(null)
    await router.push("/sign-in")
  } catch (error) {
    logoutError.value =
      error instanceof Error ? error.message : "You could not be signed out."
  }
}
</script>

<template>
  <div class="app-frame">
    <aside :class="open ? 'sidebar sidebar-open' : 'sidebar'">
      <div class="sidebar-top">
        <Brand />
        <BaseButton
          variant="ghost"
          class-name="sidebar-close"
          aria-label="Close menu"
          @click="open = false"
        >
          <Icon name="X" :size="20" />
        </BaseButton>
      </div>
      <nav class="sidebar-nav" aria-label="Primary">
        <RouterLink
          v-for="item in items"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          active-class="nav-item-active"
          exact-active-class="nav-item-active"
          @click="open = false"
        >
          <Icon :name="item.icon" :size="19" /> {{ item.label }}
        </RouterLink>
      </nav>
      <div class="sidebar-foot">
        <div v-if="account.user" class="account-identity">
          <ProfileAvatar
            :src="account.profilePictureUrl ? apiUrl(account.profilePictureUrl) : null"
            :name="account.user.displayName || account.user.publicId"
            size="small"
          />
          <strong>{{ account.user.displayName || "Private account" }}</strong>
          <span>{{ account.user.publicId }}</span>
        </div>
        <p v-if="logoutError" class="form-error" role="alert">{{ logoutError }}</p>
        <button v-if="account.user" class="quick-exit" @click="signOut">
          <Icon name="LogOut" :size="18" /> Sign out
        </button>
        <button class="quick-exit" @click="quickExit">
          <Icon name="LogOut" :size="18" /> Quick Exit
        </button>
      </div>
    </aside>
    <button
      v-if="open"
      class="sidebar-scrim"
      aria-label="Close menu"
      @click="open = false"
    />
    <main class="app-main">
      <header class="app-header">
        <button
          class="icon-button menu-button"
          aria-label="Open menu"
          @click="open = true"
        >
          <Icon name="Menu" :size="22" />
        </button>
        <div class="page-heading">
          <span v-if="eyebrow">{{ eyebrow }}</span>
          <h1>{{ title }}</h1>
        </div>
        <div class="header-actions">
          <slot name="action" />
          <NotificationMenu />
        </div>
      </header>
      <div :key="route.path" class="app-content">
        <Notice v-if="account.error" title="Account connection issue" tone="warning">
          {{ account.error }}
        </Notice>
        <div v-if="pageAccess === 'checking'" class="empty-state" role="status">
          <span><Icon name="ShieldCheck" :size="26" /></span><h2>Checking your account</h2><p>Your private dashboard will load when the account session is verified.</p>
        </div>
        <Notice v-else-if="pageAccess === 'sign-in'" title="Sign in to continue">
          This page requires an active ShepherdConnect account.
          <RouterLink to="/sign-in">Sign in securely</RouterLink>
        </Notice>
        <Notice v-else-if="pageAccess === 'denied'" title="This page is not available">
          Your current account role does not have access to this workspace.
        </Notice>
        <slot v-else />
      </div>
    </main>
    <nav class="mobile-nav" aria-label="Mobile navigation">
      <RouterLink
        v-for="item in items.slice(0, 4)"
        :key="item.to"
        :to="item.to"
        class="mobile-nav-item"
        active-class="active"
        exact-active-class="active"
      >
        <Icon :name="item.icon" :size="20" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
