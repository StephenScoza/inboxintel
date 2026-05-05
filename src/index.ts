import { config } from "./config";
import { createWebServer } from "./web/server";

async function main() {
  const app = createWebServer();

  app.listen(config.port, () => {
    console.log(`InboxIntel server running on ${config.webBaseUrl}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
