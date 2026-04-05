import { ref } from "vue";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useSaveState() {
  const status = ref<SaveStatus>("idle");
  const errorMessage = ref<string | null>(null);
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  async function save(fn: () => Promise<void>): Promise<void> {
    if (resetTimer) clearTimeout(resetTimer);
    status.value = "saving";
    errorMessage.value = null;
    try {
      await fn();
      status.value = "saved";
      resetTimer = setTimeout(() => {
        status.value = "idle";
      }, 2500);
    } catch (err) {
      status.value = "error";
      errorMessage.value = err instanceof Error ? err.message : "Something went wrong";
    }
  }

  return { status, errorMessage, save };
}
