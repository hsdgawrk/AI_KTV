import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientCommand, ServerEvent } from "../../shared/protocol";
import { type ConnectionRole, handleClientCommand } from "./commandGateway";
import { KtvRoom } from "./room";

const PORT = Number(process.env.PORT ?? 3000);
const room = new KtvRoom();
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const roles = new Map<WebSocket, ConnectionRole>();

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../dist/client");
const publicAssets = path.resolve(__dirname, "../../public");
app.use(express.static(publicAssets));
app.use(express.static(clientDist));
app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(clientDist, "index.html"));
});

wss.on("connection", (socket) => {
  roles.set(socket, { kind: "unknown" });
  send(socket, { type: "roomState", state: room.getState() });

  socket.on("message", (raw) => {
    let command: ClientCommand;
    try {
      command = JSON.parse(String(raw)) as ClientCommand;
    } catch {
      send(socket, {
        type: "commandRejected",
        command: "registerMaster",
        reason: "命令格式错误"
      });
      return;
    }

    const outcome = handleClientCommand(room, roles.get(socket) ?? { kind: "unknown" }, command);
    if (outcome.nextRole) roles.set(socket, outcome.nextRole);
    for (const event of outcome.events) send(socket, event);
    if (outcome.broadcastState) broadcastState();
  });

  socket.on("close", () => {
    const role = roles.get(socket);
    roles.delete(socket);
    if (role?.kind === "master") {
      room.disconnectMaster();
      broadcastState();
    }
    if (role?.kind === "slave") {
      room.disconnectSlave(role.pairedSlaveId);
      broadcastState();
    }
  });
});

setInterval(() => {
  const before = JSON.stringify(room.getState().slaveSlots);
  room.expireDisconnectedSlaves();
  const after = JSON.stringify(room.getState().slaveSlots);
  if (before !== after) broadcastState();
}, 5_000);

server.listen(PORT, () => {
  console.log(`AI-KTV Server listening on http://localhost:${PORT}`);
});

function reject(socket: WebSocket, command: ClientCommand, reason: string): void {
  send(socket, { type: "commandRejected", command: command.type, reason });
}

function broadcastState(): void {
  const state = room.getState();
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      send(client, { type: "roomState", state });
    }
  }
}

function send(socket: WebSocket, event: ServerEvent): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(event));
  }
}
