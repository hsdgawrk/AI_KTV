import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientCommand, KtvRoomState, ServerEvent } from "../../shared/protocol";

export function useRoomSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<KtvRoomState>();
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState<string>();
  const [lastEvent, setLastEvent] = useState<ServerEvent>();

  useEffect(() => {
    const socket = new WebSocket(serverWsUrl());
    socketRef.current = socket;
    setStatus("connecting");

    socket.addEventListener("open", () => setStatus("open"));
    socket.addEventListener("close", () => setStatus("closed"));
    socket.addEventListener("error", () => setError("连接 Server 失败"));
    socket.addEventListener("message", (message) => {
      const event = JSON.parse(String(message.data)) as ServerEvent;
      setLastEvent(event);
      if ("state" in event) setState(event.state);
      if (event.type === "commandRejected") setError(event.reason);
    });

    return () => socket.close();
  }, []);

  const send = useMemo(
    () => (command: ClientCommand) => {
      setError(undefined);
      socketRef.current?.send(JSON.stringify(command));
    },
    []
  );

  return { state, status, error, lastEvent, send, clearError: () => setError(undefined) };
}

function serverWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}
