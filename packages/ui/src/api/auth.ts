import type { AuthenticatedUser } from "@quinn/shared";
import { api } from "./client.js";

export const authApi = {
  getMe: () => api.get<AuthenticatedUser>("/auth/me"),
  logout: () => api.post<void>("/auth/logout", {}),
};
