import { createRouter, createWebHistory } from "vue-router"

import App from "./App.vue"

const router = createRouter({
  history: createWebHistory(),

  routes: [
    { path: "/", name: "home", component: App },

    { path: "/about", name: "about", component: App },

    { path: "/privacy", name: "privacy", component: App },

    { path: "/needs", name: "needs", component: App },

    { path: "/counselors", name: "counselors", component: App },

    { path: "/counselors/:id", name: "counselor-profile", component: App },

    { path: "/request/:id", name: "request", component: App },

    { path: "/sign-in", name: "sign-in", component: App },

    { path: "/app", name: "seeker-dashboard", component: App },

    { path: "/settings", name: "account-settings", component: App },

    { path: "/counselor", name: "counselor-dashboard", component: App },
    { path: "/counselor/disciples", name: "counselor-disciples", component: App },
    { path: "/counselor-application", name: "counselor-application", component: App },

    { path: "/counseling", name: "counseling", component: App },

    { path: "/guidance", name: "guidance", component: App },

    { path: "/journey", name: "journey", component: App },

    { path: "/admin", name: "admin", component: App },

    { path: "/reports", name: "reports", component: App },

    { path: "/safe", name: "safe", component: App },

    { path: "/:pathMatch(.*)*", name: "not-found", component: App },
  ],

  scrollBehavior: () => ({
    top: 0,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  }),
})

export default router
