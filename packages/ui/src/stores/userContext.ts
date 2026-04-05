import { ref } from "vue";
import { defineStore } from "pinia";
import type { UserContext } from "@quinn/shared";
import { userContextApi } from "../api/userContext.js";

export const useUserContextStore = defineStore("userContext", () => {
  const context = ref<UserContext | null>(null);
  const status = ref<"idle" | "loading" | "error">("idle");

  async function fetch(): Promise<void> {
    status.value = "loading";
    try {
      const res = await userContextApi.get();
      context.value = res.userContext;
      status.value = "idle";
    } catch {
      status.value = "error";
    }
  }

  async function save(text: string): Promise<void> {
    context.value = await userContextApi.update(text);
  }

  return { context, status, fetch, save };
});
