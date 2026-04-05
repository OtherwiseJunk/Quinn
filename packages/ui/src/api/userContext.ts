import type { UserContext } from "@quinn/shared";
import { api } from "./client.js";

export const userContextApi = {
  get: () => api.get<{ userContext: UserContext | null }>("/user/context"),
  update: (context: string) =>
    api.put<UserContext>("/user/context", { context }),
};
