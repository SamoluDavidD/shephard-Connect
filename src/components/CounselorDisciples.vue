<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"
import { api } from "../lib/api"
import Badge from "./Badge.vue"
import BaseButton from "./BaseButton.vue"
import Icon from "./Icon.vue"

type Disciple = {
  seeker_public_id: string
  is_anonymous: boolean
  display_name: string
  counseling_count: number
  conversation_count: number
  open_conversations: number
  last_activity_at: string
  has_active_counseling: boolean
  support_categories: string[] | null
}

const disciples = ref<Disciple[]>([])
const loading = ref(true)
const refreshing = ref(false)
const error = ref("")
let refreshTimer: number | undefined
let refreshInFlight = false

async function loadDisciples(isBackgroundRefresh = false) {
  if (refreshInFlight) return
  refreshInFlight = true
  if (isBackgroundRefresh) refreshing.value = true
  else loading.value = true
  error.value = ""
  try {
    const result = await api<{ disciples: Disciple[] }>("/counselor/disciples")
    disciples.value = result.disciples
  } catch (loadError) {
    error.value =
      loadError instanceof Error ? loadError.message : "Your disciples could not be loaded."
  } finally {
    loading.value = false
    refreshing.value = false
    refreshInFlight = false
  }
}

function formatDate(timestamp: string) {
  return new Date(timestamp).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

onMounted(() => {
  void loadDisciples()
  refreshTimer = window.setInterval(() => void loadDisciples(true), 30_000)
})

onBeforeUnmount(() => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer)
})
</script>

<template>
  <section class="panel disciples-panel">
    <div class="card-heading">
      <div>
        <span class="section-kicker">Ongoing care</span>
        <h2>Disciples</h2>
      </div>
      <div class="disciples-heading-actions">
        <small v-if="refreshing" role="status">Refreshing…</small>
        <BaseButton variant="secondary" :disabled="loading || refreshing" @click="loadDisciples(true)">
          <Icon name="Clock3" :size="16" /> Refresh
        </BaseButton>
      </div>
    </div>
    <p class="disciples-intro">
      People with an accepted or completed counseling relationship assigned to you. Anonymous
      participants remain identified only by their ShepherdConnect ID.
    </p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <div v-if="loading" class="empty-state" role="status">
      <span><Icon name="Clock3" :size="26" /></span>
      <h3>Loading disciples</h3>
      <p>Your assigned counseling relationships are being retrieved.</p>
    </div>
    <div v-else-if="!disciples.length" class="empty-state">
      <span><Icon name="HeartHandshake" :size="26" /></span>
      <h3>No disciples yet</h3>
      <p>People you have counseled will appear here after you accept a counseling request.</p>
    </div>
    <div v-else class="disciples-list">
      <article v-for="disciple in disciples" :key="disciple.seeker_public_id" class="disciple-card">
        <div class="disciple-card-heading">
          <span class="private-avatar"><Icon name="EyeOff" :size="18" /></span>
          <div>
            <h3>{{ disciple.display_name }}</h3>
            <small>{{ disciple.seeker_public_id }}<template v-if="disciple.is_anonymous"> · Anonymous account</template></small>
          </div>
          <Badge :tone="disciple.has_active_counseling ? 'success' : 'neutral'">
            {{ disciple.has_active_counseling ? "Counseling active" : "Past counseling" }}
          </Badge>
        </div>
        <div class="disciple-card-details">
          <span><strong>{{ disciple.counseling_count }}</strong> counseling request{{ disciple.counseling_count === 1 ? "" : "s" }}</span>
          <span><strong>{{ disciple.open_conversations }}</strong> open conversation{{ disciple.open_conversations === 1 ? "" : "s" }}</span>
          <span>Last activity <strong>{{ formatDate(disciple.last_activity_at) }}</strong></span>
        </div>
        <div v-if="disciple.support_categories?.length" class="disciple-categories">
          <Badge v-for="category in disciple.support_categories" :key="category">{{ category }}</Badge>
        </div>
        <RouterLink class="inline-action" to="/counseling">Open counseling conversations</RouterLink>
      </article>
    </div>
  </section>
</template>
