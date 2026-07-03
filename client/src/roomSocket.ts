import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientCommand, KtvRoomState, ServerEvent } from "../../shared/protocol";

type PairedEvent = Extract<ServerEvent, { type: "paired" }>;
type SongLibraryRefreshEvent = Extract<ServerEvent, { type: "songLibraryRefreshResult" }>;

export function useRoomSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<KtvRoomState>();
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState<string>();
  const [lastEvent, setLastEvent] = useState<ServerEvent>();
  const [pairedEvent, setPairedEvent] = useState<PairedEvent>();
  const [songLibraryRefreshEvent, setSongLibraryRefreshEvent] = useState<SongLibraryRefreshEvent>();

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
      if (event.type === "paired") setPairedEvent(event);
      if (event.type === "songLibraryRefreshResult") setSongLibraryRefreshEvent(event);
      if (event.type === "commandRejected") setError(event.reason);
    });

    return () => socket.close();
  }, []);

  const send = useCallback(
    (command: ClientCommand) => {
      setError(undefined);
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setError("Server 尚未连接，请稍后再试");
        return false;
      }

      socket.send(JSON.stringify(command));
      return true;
    },
    []
  );

  return {
    state,
    status,
    error,
    lastEvent,
    pairedEvent,
    songLibraryRefreshEvent,
    send,
    clearError: () => setError(undefined)
  };
}

function serverWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}
