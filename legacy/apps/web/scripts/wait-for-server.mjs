// Waits for the local API server port before starting Vite.
// Skipped when VITE_DEV_API_TARGET is set (dev:web uses prod API).

if (process.env.VITE_DEV_API_TARGET) process.exit(0);

import { createConnection } from "node:net";

const port = Number(process.env.VITE_SERVER_PORT ?? 3001);
const RETRY_INTERVAL_MS = 300;

function check() {
  const socket = createConnection(port, "localhost");
  socket.on("connect", () => {
    socket.destroy();
    process.exit(0);
  });
  socket.on("error", () => {
    setTimeout(check, RETRY_INTERVAL_MS);
  });
}

check();
