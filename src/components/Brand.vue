<script setup lang="ts">
import Icon from "./Icon.vue"

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
</script>

<template>
  <div class="brand">
    <span class="brand-mark" aria-hidden="true">
      <Icon name="Leaf" :size="compact ? 19 : 22" />
    </span>
    <span :class="compact ? 'brand-name brand-name-sm' : 'brand-name'">
      ShepherdConnect
    </span>
  </div>
</template>
