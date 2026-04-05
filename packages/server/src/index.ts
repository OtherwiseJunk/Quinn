import app from "./app.js";
import { env } from "./config.js";
import { pool } from "./db/pool.js";
import { cleanupExpired, decayDiscipline } from "./db/botTimeouts.js";

pool.connect()
  .then((client) => {
    client.release();
    console.log("Database connection established");
    app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);

      setInterval(() => {
        cleanupExpired().catch((err) =>
          console.error("[Quinn] Failed to clean up expired timeouts:", err)
        );
      }, 5 * 60 * 1000);

      setInterval(() => {
        decayDiscipline().catch((err) =>
          console.error("[Quinn] Failed to decay discipline:", err)
        );
      }, 60 * 60 * 1000);

    });
  })
  .catch((err) => {
    console.error("Failed to connect to database:", err);
    process.exit(1);
  });
