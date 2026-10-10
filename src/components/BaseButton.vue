<script setup lang="ts">
defineOptions({ inheritAttrs: false })

withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger"
    className?: string
    type?: "button" | "submit" | "reset"
    disabled?: boolean
  }>(),
  { variant: "primary", className: "", type: "button", disabled: false },
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="`btn btn-${variant} ${className}`"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>
