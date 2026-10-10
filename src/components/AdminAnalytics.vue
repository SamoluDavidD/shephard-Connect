<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { api } from "../lib/api"
import Badge from "./Badge.vue"
import Icon from "./Icon.vue"

type Aggregate = { value: number | null; suppressed: boolean }
type Analytics = {
  generatedAt: string
  periodDays: number
  minimumCohort: number
  metrics: Record<string, Aggregate>
  trends: Array<{
    label: string
    newAccounts: Aggregate
    newRequests: Aggregate
    newConversations: Aggregate
    completedStages: Aggregate
  }>
  requestStatuses: Record<string, Aggregate>
  supportCategories: Array<{ label: string; total: Aggregate }>
  journey: Record<string, Record<string, Aggregate>>
}

const periodDays = ref(30)
const analytics = ref<Analytics | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const error = ref("")
let refreshTimer: number | undefined
let refreshInFlight = false

const metricCards = [
  { key: "total_accounts", label: "Total accounts", icon: "Users" },
  { key: "new_accounts", label: "New accounts", icon: "UserRound" },
  { key: "active_counselors", label: "Active counselors", icon: "HeartHandshake" },
  { key: "new_requests", label: "New counseling requests", icon: "MessageCircle" },
  { key: "accepted_requests", label: "Accepted requests", icon: "CheckCircle2" },
  { key: "open_conversations", label: "Open conversations", icon: "MessageCircle" },
  { key: "messages_sent", label: "Messages sent", icon: "Send" },
  { key: "completed_journey_stages", label: "Journey stages completed", icon: "Sprout" },
]
const statusNames = ["Pending", "Accepted", "Declined", "Cancelled", "Closed"]
const journeyStageNames = ["Come", "Connect", "Counsel", "Follow Up", "Disciple", "Grow"]
const visibleJourney = computed(() =>
  journeyStageNames.map((stage) => ({
    stage,
    progress: analytics.value?.journey[stage] || {},
  })),
)

function aggregateValue(item?: Aggregate) {
  if (!item) return "—"
  return item.suppressed ? `<${analytics.value?.minimumCohort || 5}` : String(item.value)
}

function barHeight(item?: Aggregate) {
  if (!item || item.suppressed || item.value === null) return "4%"
  const values = analytics.value?.trends.flatMap((trend) => [
    trend.newAccounts,
    trend.newRequests,
    trend.newConversations,
    trend.completedStages,
  ]) || []
  const maximum = Math.max(1, ...values.map((value) => value.value || 0))
  return `${Math.max(5, Math.round((item.value / maximum) * 100))}%`
}

async function loadAnalytics(isBackgroundRefresh = false) {
  if (refreshInFlight) return
  refreshInFlight = true
  if (isBackgroundRefresh) refreshing.value = true
  else loading.value = true
  error.value = ""
  try {
    analytics.value = await api<Analytics>(`/admin/analytics?days=${periodDays.value}`)
  } catch (loadError) {
    error.value =
      loadError instanceof Error ? loadError.message : "Analytics could not be loaded."
  } finally {
    loading.value = false
    refreshing.value = false
    refreshInFlight = false
  }
}

watch(periodDays, () => void loadAnalytics())

onMounted(() => {
  void loadAnalytics()
  refreshTimer = window.setInterval(() => void loadAnalytics(true), 30_000)
})

onBeforeUnmount(() => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer)
})
</script>

<template>
  <section class="analytics-workspace">
    <div class="analytics-toolbar">
      <label>
        <span>Reporting period</span>
        <select v-model.number="periodDays" class="control" aria-label="Analytics reporting period">
          <option :value="7">Last 7 days</option>
          <option :value="30">Last 30 days</option>
          <option :value="90">Last 90 days</option>
        </select>
      </label>
      <span v-if="analytics" class="analytics-updated">
        <span class="status-dot" /> Live · updated {{ new Date(analytics.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }}
        <template v-if="refreshing"> · refreshing</template>
      </span>
    </div>
    <div v-if="error" class="analytics-error" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="inline-action" @click="loadAnalytics()">Try again</button>
    </div>
    <div v-if="loading" class="empty-state" role="status">
      <span><Icon name="BarChart3" :size="26" /></span>
      <h2>Loading analytics</h2>
      <p>Privacy-protected aggregates are being calculated from current platform data.</p>
    </div>
    <template v-else-if="analytics">
      <div class="stats-row analytics-metrics">
        <article v-for="metric in metricCards" :key="metric.key" class="analytics-metric">
          <span><Icon :name="metric.icon" :size="20" /></span>
          <small>{{ metric.label }}</small>
          <strong>{{ aggregateValue(analytics.metrics[metric.key]) }}</strong>
          <em>{{ metric.key === "total_accounts" || metric.key === "active_counselors" || metric.key === "open_conversations" ? "Current total" : `Last ${analytics.periodDays} days` }}</em>
        </article>
      </div>

      <section class="panel analytics-trends">
        <div class="card-heading">
          <div><span class="section-kicker">Activity over time</span><h2>Platform trends</h2></div>
          <Badge>7 periods</Badge>
        </div>
        <div class="analytics-chart" role="img" :aria-label="`New accounts, counseling requests, conversations, and completed journey stages over the last ${analytics.periodDays} days`">
          <div v-for="trend in analytics.trends" :key="trend.label" class="analytics-chart-period">
            <div class="analytics-bars">
              <span class="analytics-bar analytics-bar-accounts" :style="{ height: barHeight(trend.newAccounts) }" :title="`Accounts: ${aggregateValue(trend.newAccounts)}`" />
              <span class="analytics-bar analytics-bar-requests" :style="{ height: barHeight(trend.newRequests) }" :title="`Requests: ${aggregateValue(trend.newRequests)}`" />
              <span class="analytics-bar analytics-bar-conversations" :style="{ height: barHeight(trend.newConversations) }" :title="`Conversations: ${aggregateValue(trend.newConversations)}`" />
              <span class="analytics-bar analytics-bar-journey" :style="{ height: barHeight(trend.completedStages) }" :title="`Completed stages: ${aggregateValue(trend.completedStages)}`" />
            </div>
            <small>{{ trend.label }}</small>
          </div>
        </div>
        <div class="analytics-legend">
          <span><i class="analytics-bar-accounts" /> Accounts</span>
          <span><i class="analytics-bar-requests" /> Requests</span>
          <span><i class="analytics-bar-conversations" /> Conversations</span>
          <span><i class="analytics-bar-journey" /> Journey stages</span>
        </div>
      </section>

      <div class="reports-grid analytics-details">
        <section class="panel">
          <div class="card-heading"><div><span class="section-kicker">Counseling demand</span><h2>Requests by category</h2></div></div>
          <div v-if="!analytics.supportCategories.length" class="empty-state">
            <h3>No category totals meet the privacy threshold</h3>
            <p>Category details are shown only when at least {{ analytics.minimumCohort }} requests are in the group.</p>
          </div>
          <div v-else class="analytics-category-list">
            <div v-for="category in analytics.supportCategories" :key="category.label">
              <span>{{ category.label }}</span>
              <strong>{{ aggregateValue(category.total) }}</strong>
            </div>
          </div>
          <h3 class="analytics-subheading">Request status in period</h3>
          <div class="analytics-status-list">
            <div v-for="status in statusNames" :key="status">
              <span>{{ status }}</span><strong>{{ aggregateValue(analytics.requestStatuses[status]) }}</strong>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="card-heading"><div><span class="section-kicker">Voluntary growth</span><h2>Journey progress</h2></div></div>
          <div class="analytics-journey-list">
            <div v-for="item in visibleJourney" :key="item.stage">
              <strong>{{ item.stage }}</strong>
              <span>In progress <b>{{ aggregateValue(item.progress.in_progress) }}</b></span>
              <span>Completed <b>{{ aggregateValue(item.progress.completed) }}</b></span>
            </div>
          </div>
          <p class="analytics-privacy-note">
            All analytics are aggregate-only. Counts below {{ analytics.minimumCohort }} are suppressed.
            Counseling message contents, personal profiles, and individual journey histories are never included.
          </p>
        </section>
      </div>
    </template>
  </section>
</template>
