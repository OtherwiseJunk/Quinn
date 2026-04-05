<template>
  <div class="page">
    <h2>Access Denied</h2>
    <p>You don't have permission to view this page.</p>
    <RouterLink to="/">Go home</RouterLink>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; background: #1a1b1e; color: #e0e0e0; font-family: system-ui, sans-serif; }
a { color: #5865f2; }
</style>
