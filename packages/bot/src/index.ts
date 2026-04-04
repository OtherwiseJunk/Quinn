import "reflect-metadata";
import { importx } from "@discordx/importer";
import { bot } from "./client.js";
import { env } from "./env.js";
import { runConsolidation } from "./cron/memoryConsolidation.js";

function scheduleConsolidation() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight.getTime() - now.getTime();

  setTimeout(() => {
    runConsolidation(bot).catch((err) =>
      console.error("Memory consolidation failed:", err)
    );
    setInterval(
      () =>
        runConsolidation(bot).catch((err) =>
          console.error("Memory consolidation failed:", err)
        ),
      24 * 60 * 60 * 1000
    );
  }, msUntilMidnight);
}

async function main() {
  await importx(
    `${import.meta.dirname}/discord/{events,commands}/**/*.{ts,js}`
  );

  await bot.login(env.discordToken);

  bot.once("ready", async () => {
    await bot.initApplicationCommands();
    console.log("Quinn is online");
    scheduleConsolidation();
    console.log("Memory consolidation scheduled for midnight");
  });
}

main().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
