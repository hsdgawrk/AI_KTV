import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientCommand, KtvRoomState } from "../../shared/protocol";
import type { RoomSocketEvent } from "./roomSocket";

type VocalPeer = {
  peer: RTCPeerConnection;
  stream: MediaStream;
  pendingIceCandidates: RTCIceCandidateInit[];
  audio: HTMLAudioElement;
};

export type MasterVocalInput = {
  resumeOutput: () => void;
  outputStatus: "idle" | "ready" | "blocked" | "playing";
  message: string;
};

export function useMasterVocalInput(options: {
  state: KtvRoomState | undefined;
  events: RoomSocketEvent[];
  send: (command: ClientCommand) => void;
}): MasterVocalInput {
  const { state, events, send } = options;
  const peersRef = useRef(new Map<string, VocalPeer>());
  const stateRef = useRef<KtvRoomState | undefined>(state);
  const lastProcessedEventIdRef = useRef(0);
  const [outputStatus, setOutputStatus] = useState<MasterVocalInput["outputStatus"]>("idle");
  const [message, setMessage] = useState("等待人声");

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const resumeOutput = useCallback(() => {
    if (peersRef.current.size === 0) {
      setOutputStatus("ready");
      setMessage("人声输出已就绪");
      return;
    }

    for (const record of peersRef.current.values()) {
      void playVocalAudio(record, setOutputStatus, setMessage);
    }
  }, []);

  const closePeer = useCallback((pairedSlaveId: string) => {
    const existing = peersRef.current.get(pairedSlaveId);
    if (!existing) return;
    existing.audio.pause();
    existing.audio.srcObject = null;
    existing.audio.remove();
    existing.peer.close();
    peersRef.current.delete(pairedSlaveId);
  }, []);

  const createPeer = useCallback(
    (pairedSlaveId: string): VocalPeer => {
      closePeer(pairedSlaveId);
      const peer = new RTCPeerConnection({ iceServers: [] });
      const stream = new MediaStream();
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.muted = false;
      audio.volume = 0;
      audio.style.display = "none";
      audio.srcObject = stream;
      document.body.append(audio);

      const record: VocalPeer = { peer, stream, pendingIceCandidates: [], audio };
      peersRef.current.set(pairedSlaveId, record);

      peer.addEventListener("icecandidate", (event) => {
        if (!event.candidate) return;
        send({
          type: "sendVocalInputSignalToSlave",
          pairedSlaveId,
          signal: { kind: "iceCandidate", candidate: event.candidate.toJSON() }
        });
      });

      peer.addEventListener("track", (event) => {
        for (const track of event.streams[0]?.getAudioTracks() ?? [event.track]) {
          if (!record.stream.getTracks().includes(track)) record.stream.addTrack(track);
        }

        applyVocalOutput(record, pairedSlaveId, stateRef.current);
        void playVocalAudio(record, setOutputStatus, setMessage);
      });

      return record;
    },
    [closePeer, send]
  );

  useEffect(() => {
    const nextEvents = events.filter((socketEvent) => socketEvent.id > lastProcessedEventIdRef.current);
    if (nextEvents.length === 0) return;
    lastProcessedEventIdRef.current = nextEvents[nextEvents.length - 1].id;

    for (const socketEvent of nextEvents) {
      const event = socketEvent.event;
      if (event.type !== "vocalInputSignalFromSlave") continue;
      const { pairedSlaveId, signal } = event;

      if (signal.kind === "offer") {
        const record = createPeer(pairedSlaveId);
        record.peer
          .setRemoteDescription(signal.description)
          .then(() => flushPendingIceCandidates(record))
          .then(() => record.peer.createAnswer())
          .then((answer) => record.peer.setLocalDescription(answer).then(() => answer))
          .then((answer) => {
            send({
              type: "sendVocalInputSignalToSlave",
              pairedSlaveId,
              signal: { kind: "answer", description: answer }
            });
          })
          .catch((error: unknown) => {
            console.warn("AI-KTV vocal input offer rejected", error);
            closePeer(pairedSlaveId);
          });
        continue;
      }

      if (signal.kind === "iceCandidate") {
        const record = peersRef.current.get(pairedSlaveId);
        if (record) addOrQueueIceCandidate(record, signal.candidate);
      }
    }
  }, [closePeer, createPeer, events, send]);

  useEffect(() => {
    const connectedSlaveIds = new Set(
      state?.slaveSlots
        .filter((slot) => slot.connectionState === "connected" && slot.pairedSlaveId)
        .map((slot) => slot.pairedSlaveId!) ?? []
    );

    for (const pairedSlaveId of peersRef.current.keys()) {
      if (!connectedSlaveIds.has(pairedSlaveId)) closePeer(pairedSlaveId);
    }

    for (const slot of state?.slaveSlots ?? []) {
      if (!slot.pairedSlaveId) continue;
      const record = peersRef.current.get(slot.pairedSlaveId);
      if (!record) continue;
      applyVocalOutput(record, slot.pairedSlaveId, state);
    }
  }, [closePeer, state?.slaveSlots]);

  useEffect(() => {
    return () => {
      for (const pairedSlaveId of peersRef.current.keys()) closePeer(pairedSlaveId);
    };
  }, [closePeer]);

  return { resumeOutput, outputStatus, message };
}

async function playVocalAudio(
  record: VocalPeer,
  setOutputStatus: (status: MasterVocalInput["outputStatus"]) => void,
  setMessage: (message: string) => void
): Promise<void> {
  try {
    await record.audio.play();
    setOutputStatus("playing");
    setMessage("人声输出中");
  } catch (error: unknown) {
    setOutputStatus("blocked");
    setMessage("需要启用人声输出");
    console.warn("AI-KTV vocal output play failed", error);
  }
}

function addOrQueueIceCandidate(record: VocalPeer, candidate: RTCIceCandidateInit): void {
  if (!record.peer.remoteDescription) {
    record.pendingIceCandidates.push(candidate);
    return;
  }

  record.peer.addIceCandidate(candidate).catch((error: unknown) => {
    console.warn("AI-KTV vocal input ICE candidate rejected", error);
  });
}

function flushPendingIceCandidates(record: VocalPeer): Promise<void[]> {
  const candidates = record.pendingIceCandidates.splice(0);
  return Promise.all(
    candidates.map((candidate) =>
      record.peer.addIceCandidate(candidate).catch((error: unknown) => {
        console.warn("AI-KTV queued vocal input ICE candidate rejected", error);
      })
    )
  );
}

function applyVocalOutput(record: VocalPeer, pairedSlaveId: string, state: KtvRoomState | undefined): void {
  const slot = state?.slaveSlots.find((candidate) => candidate.pairedSlaveId === pairedSlaveId);
  record.audio.volume =
    slot?.connectionState === "connected" &&
    slot.vocalInputAvailability === "available" &&
    slot.vocalInputState === "singing"
      ? slot.vocalVolume / 100
      : 0;
}
