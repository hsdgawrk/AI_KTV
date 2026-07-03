import { createServer } from "vite";

const server = await createServer({
  server: {
    host: "0.0.0.0"
  }
});

await server.listen();
server.printUrls();

const keepAlive = setInterval(() => undefined, 60_000);

async function close() {
  clearInterval(keepAlive);
  await server.close();
  process.exit(0);
}

process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
