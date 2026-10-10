<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
</script>

<template>
  <div class="brand">
    <img
      class="brand-mark"
      :class="{ 'brand-mark-compact': compact }"
      src="/LOGO.png"
      alt=""
    />
    <span :class="compact ? 'brand-name brand-name-sm' : 'brand-name'">
      ShepherdConnect
    </span>
  </div>
</template>
