import { useCallback, useEffect, useRef } from "react";
import type { ClientCommand, KtvRoomState, ServerEvent } from "../../shared/protocol";

type VocalPeer = {
  peer: RTCPeerConnection;
  stream: MediaStream;
  source?: MediaStreamAudioSourceNode;
  gain?: GainNode;
};

export type MasterVocalInput = {
  resumeOutput: () => void;
};

export function useMasterVocalInput(options: {
  state: KtvRoomState | undefined;
  lastEvent: ServerEvent | undefined;
  send: (command: ClientCommand) => void;
}): MasterVocalInput {
  const { state, lastEvent, send } = options;
  const audioContextRef = useRef<AudioContext | null>(null);
  const peersRef = useRef(new Map<string, VocalPeer>());

  const audioContext = useCallback((): AudioContext | undefined => {
    const AudioContextConstructor =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return undefined;
    if (!audioContextRef.current) audioContextRef.current = new AudioContextConstructor();
    return audioContextRef.current;
  }, []);

  const resumeOutput = useCallback(() => {
    audioContextRef.current?.resume().catch((error: unknown) => {
      console.warn("AI-KTV vocal output resume failed", error);
    });
  }, []);

  const closePeer = useCallback((pairedSlaveId: string) => {
    const existing = peersRef.current.get(pairedSlaveId);
    if (!existing) return;
    existing.source?.disconnect();
    existing.gain?.disconnect();
    existing.peer.close();
    peersRef.current.delete(pairedSlaveId);
  }, []);

  const createPeer = useCallback(
    (pairedSlaveId: string): VocalPeer => {
      closePeer(pairedSlaveId);
      const peer = new RTCPeerConnection({ iceServers: [] });
      const stream = new MediaStream();
      const record: VocalPeer = { peer, stream };
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
        const context = audioContext();
        if (!context) return;
        for (const track of event.streams[0]?.getAudioTracks() ?? [event.track]) {
          if (!record.stream.getTracks().includes(track)) record.stream.addTrack(track);
        }

        if (!record.source) {
          record.source = context.createMediaStreamSource(record.stream);
          record.gain = context.createGain();
          record.gain.gain.value = 0;
          record.source.connect(record.gain).connect(context.destination);
        }
      });

      return record;
    },
    [audioContext, closePeer, send]
  );

  useEffect(() => {
    if (!lastEvent || lastEvent.type !== "vocalInputSignalFromSlave") return;
    const { pairedSlaveId, signal } = lastEvent;

    if (signal.kind === "offer") {
      const record = createPeer(pairedSlaveId);
      record.peer
        .setRemoteDescription(signal.description)
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
      return;
    }

    if (signal.kind === "iceCandidate") {
      peersRef.current.get(pairedSlaveId)?.peer.addIceCandidate(signal.candidate).catch((error: unknown) => {
        console.warn("AI-KTV vocal input ICE candidate rejected", error);
      });
    }
  }, [closePeer, createPeer, lastEvent, send]);

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
      if (!record?.gain) continue;
      const targetGain =
        slot.connectionState === "connected" &&
        slot.vocalInputAvailability === "available" &&
        slot.vocalInputState === "singing"
          ? slot.vocalVolume / 100
          : 0;
      record.gain.gain.setTargetAtTime(targetGain, record.gain.context.currentTime, 0.03);
    }
  }, [closePeer, state?.slaveSlots]);

  useEffect(() => {
    return () => {
      for (const pairedSlaveId of peersRef.current.keys()) closePeer(pairedSlaveId);
      audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
    };
  }, [closePeer]);

  return { resumeOutput };
}
