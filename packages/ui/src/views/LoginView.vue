<template>
  <div class="login">
    <div class="login__card">
      <h1 class="login__title">Quinn</h1>
      <p class="login__subtitle">Sign in to manage your bot settings.</p>
      <a href="/api/auth/login" class="login__btn">Login with Discord</a>
    </div>
  </div>
</template>

<style scoped>
.login { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #1a1b1e; font-family: system-ui, sans-serif; }
.login__card { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 2.5rem; background: #111214; border: 1px solid #2b2c30; border-radius: 12px; width: 320px; }
.login__title { margin: 0; font-size: 1.75rem; font-weight: 700; color: #fff; }
.login__subtitle { margin: 0; font-size: 0.9rem; color: #888; text-align: center; }
.login__btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.625rem 1.25rem; background: #5865f2; color: #fff; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 500; transition: background 0.15s; }
.login__btn:hover { background: #4752c4; }
</style>
