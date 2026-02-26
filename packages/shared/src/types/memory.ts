export interface BotMemory {
  id: number;
  guildId: string;
  /** NULL for Quinn's own opinions / server-wide observations */
  subjectUserId: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}
