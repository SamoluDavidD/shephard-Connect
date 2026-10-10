<script setup lang="ts">
import { computed, ref, watch } from "vue"

const props = withDefaults(defineProps<{
  src?: string | null
  name?: string | null
  size?: "small" | "medium" | "large"
}>(), {
  src: null,
  name: null,
  size: "medium",
})

const failed = ref(false)
watch(() => props.src, () => { failed.value = false })

const initials = computed(() =>
  (props.name || "SC")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "SC",
)
</script>

<template>
  <span class="profile-avatar" :class="`profile-avatar-${size}`" aria-hidden="true">
    <img v-if="src && !failed" :src="src" alt="" crossorigin="use-credentials" @error="failed = true" />
    <span v-else>{{ initials }}</span>
  </span>
</template>
