import { ref } from "vue";
import { defineStore } from "pinia";
import { adminApi } from "../api/admin.js";

export const useSystemPromptStore = defineStore("systemPrompt", () => {
  const prompt = ref<string | null>(null);
  const status = ref<"idle" | "loading" | "error">("idle");

  const globalForbiddenWords = ref<string[]>([]);
  const wordsStatus = ref<"idle" | "loading" | "error">("idle");

  const contextMessageLimit = ref<number>(25);
  const limitStatus = ref<"idle" | "loading" | "error">("idle");

  async function fetch(): Promise<void> {
    status.value = "loading";
    try {
      const res = await adminApi.getSystemPrompt();
      prompt.value = res.prompt;
      status.value = "idle";
    } catch {
      status.value = "error";
    }
  }

  async function save(text: string): Promise<void> {
    const res = await adminApi.updateSystemPrompt(text);
    prompt.value = res.prompt;
  }

  async function fetchWords(): Promise<void> {
    wordsStatus.value = "loading";
    try {
      const res = await adminApi.getGlobalForbiddenWords();
      globalForbiddenWords.value = res.words;
      wordsStatus.value = "idle";
    } catch {
      wordsStatus.value = "error";
    }
  }

  async function saveWords(words: string[]): Promise<void> {
    const res = await adminApi.updateGlobalForbiddenWords(words);
    globalForbiddenWords.value = res.words;
  }

  async function fetchLimit(): Promise<void> {
    limitStatus.value = "loading";
    try {
      const res = await adminApi.getContextMessageLimit();
      contextMessageLimit.value = res.limit;
      limitStatus.value = "idle";
    } catch {
      limitStatus.value = "error";
    }
  }

  async function saveLimit(limit: number): Promise<void> {
    const res = await adminApi.updateContextMessageLimit(limit);
    contextMessageLimit.value = res.limit;
  }

  return { prompt, status, fetch, save, globalForbiddenWords, wordsStatus, fetchWords, saveWords, contextMessageLimit, limitStatus, fetchLimit, saveLimit };
});
