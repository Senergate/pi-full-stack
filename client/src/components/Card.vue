<script setup>
// No script needed for now
</script>

<template>
  <q-card flat class="app-card">
    <q-card-section>
      <slot />
    </q-card-section>
  </q-card>
</template>

<style scoped>
.app-card {
  box-shadow: none !important;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
}
</style>
