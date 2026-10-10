<script setup lang="ts">
import Icon from "./Icon.vue"

withDefaults(
  defineProps<{
    title: string
    tone?: "info" | "warning" | "success"
  }>(),
  { tone: "info" },
)
</script>

<template>
  <div :class="`notice notice-${tone}`" role="status">
    <Icon name="CircleHelp" :size="19" />
    <div>
      <strong>{{ title }}</strong>
      <p><slot /></p>
    </div>
  </div>
</template>
