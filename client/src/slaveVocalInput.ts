import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientCommand, KtvRoomState, ServerEvent, VocalInputAvailability } from "../../shared/protocol";

type SlaveVocalInput = {
  message: string;
  permissionState: "idle" | "requesting" | "granted" | "denied";
};

const VOCAL_INPUT_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false
  },
  video: false
};

export function useSlaveVocalInput(options: {
  state: KtvRoomState | undefined;
  pairedSlaveId: string;
  lastEvent: ServerEvent | undefined;
  send: (command: ClientCommand) => void;
}): SlaveVocalInput {
  const { state, pairedSlaveId, lastEvent, send } = options;
  const [message, setMessage] = useState("等待配对");
  const [permissionState, setPermissionState] = useState<SlaveVocalInput["permissionState"]>("idle");
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const restartTimerRef = useRef<number | undefined>(undefined);
  const reportedAvailabilityRef = useRef<VocalInputAvailability | undefined>(undefined);
  const serverAvailabilityRef = useRef<VocalInputAvailability | undefined>(undefined);
  const wasAvailableRef = useRef(false);
  const negotiationIdRef = useRef(0);

  const mySlot = state?.slaveSlots.find((slot) => slot.pairedSlaveId === pairedSlaveId);
  const isPaired = Boolean(mySlot && mySlot.connectionState === "connected");
  const masterConnected = Boolean(state?.master.connected);

  useEffect(() => {
    serverAvailabilityRef.current = mySlot?.vocalInputAvailability;
  }, [mySlot?.vocalInputAvailability]);

  const reportAvailability = useCallback(
    (availability: VocalInputAvailability) => {
      if (
        !pairedSlaveId ||
        (reportedAvailabilityRef.current === availability && serverAvailabilityRef.current === availability)
      ) {
        return;
      }
      reportedAvailabilityRef.current = availability;
      if (availability === "available") wasAvailableRef.current = true;
      send({ type: "setVocalInputAvailability", pairedSlaveId, availability });
    },
    [pairedSlaveId, send]
  );

  const closePeer = useCallback(() => {
    window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = undefined;
    peerRef.current?.close();
    peerRef.current = null;
    pendingIceCandidatesRef.current = [];
  }, []);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  }, []);

  const startNegotiation = useCallback(async () => {
    if (!pairedSlaveId || !localStreamRef.current || !masterConnected) return;

    const negotiationId = ++negotiationIdRef.current;
    closePeer();
    setMessage("正在连接主屏");
    reportAvailability("available");

    const peer = new RTCPeerConnection({ iceServers: [] });
    peerRef.current = peer;
    pendingIceCandidatesRef.current = [];
    localStreamRef.current.getAudioTracks().forEach((track) => peer.addTrack(track, localStreamRef.current!));

    peer.addEventListener("icecandidate", (event) => {
      if (!event.candidate) return;
      send({
        type: "sendVocalInputSignalToMaster",
        pairedSlaveId,
        signal: { kind: "iceCandidate", candidate: event.candidate.toJSON() }
      });
    });

    const markAvailable = () => {
      setMessage("麦克风可演唱");
      reportAvailability("available");
    };
    const markInterrupted = () => {
      const nextAvailability = wasAvailableRef.current ? "interrupted" : "unavailable";
      setMessage(nextAvailability === "interrupted" ? "人声连接中断" : "麦克风未可用");
      reportAvailability(nextAvailability);
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = window.setTimeout(() => {
        if (masterConnected && localStreamRef.current) void startNegotiation();
      }, 1200);
    };

    peer.addEventListener("connectionstatechange", () => {
      if (peerRef.current !== peer) return;
      if (peer.connectionState === "connected") {
        markAvailable();
        return;
      }

      if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
        markInterrupted();
      }
    });

    peer.addEventListener("iceconnectionstatechange", () => {
      if (peerRef.current !== peer) return;
      if (peer.iceConnectionState === "connected" || peer.iceConnectionState === "completed") {
        markAvailable();
      }

      if (peer.iceConnectionState === "failed" || peer.iceConnectionState === "disconnected") {
        markInterrupted();
      }
    });

    try {
      const offer = await peer.createOffer();
      if (peerRef.current !== peer || negotiationId !== negotiationIdRef.current) return;
      await peer.setLocalDescription(offer);
      send({
        type: "sendVocalInputSignalToMaster",
        pairedSlaveId,
        signal: { kind: "offer", description: offer }
      });
    } catch (error) {
      console.warn("AI-KTV vocal input offer failed", error);
      if (peerRef.current === peer) {
        reportAvailability(wasAvailableRef.current ? "interrupted" : "unavailable");
        setMessage("麦克风未可用");
      }
    }
  }, [closePeer, masterConnected, pairedSlaveId, reportAvailability, send]);

  useEffect(() => {
    if (!isPaired) {
      reportedAvailabilityRef.current = undefined;
      wasAvailableRef.current = false;
      setPermissionState("idle");
      setMessage("等待配对");
      closePeer();
      stopLocalStream();
      return;
    }

    let cancelled = false;
    if (!localStreamRef.current) {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermissionState("denied");
        setMessage(window.isSecureContext ? "浏览器不支持麦克风" : "需要 HTTPS 或 localhost 才能使用麦克风");
        reportAvailability("unavailable");
        return;
      }

      setPermissionState("requesting");
      setMessage("正在请求麦克风");
      navigator.mediaDevices
        .getUserMedia(VOCAL_INPUT_CONSTRAINTS)
        .then((stream) => {
          if (cancelled) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          localStreamRef.current = stream;
          setPermissionState("granted");
          setMessage(masterConnected ? "正在连接主屏" : "等待主屏");
          if (masterConnected) {
            reportAvailability("available");
            void startNegotiation();
          } else {
            reportAvailability(wasAvailableRef.current ? "interrupted" : "unavailable");
          }
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          console.warn("AI-KTV microphone capture failed", error);
          setPermissionState("denied");
          setMessage("麦克风未授权");
          reportAvailability("unavailable");
        });
    }

    return () => {
      cancelled = true;
    };
  }, [closePeer, isPaired, masterConnected, reportAvailability, startNegotiation, stopLocalStream]);

  useEffect(() => {
    if (!isPaired || !localStreamRef.current) return;
    if (!masterConnected) {
      closePeer();
      setMessage(wasAvailableRef.current ? "等待主屏恢复" : "等待主屏");
      reportAvailability(wasAvailableRef.current ? "interrupted" : "unavailable");
      return;
    }

    if (!peerRef.current) void startNegotiation();
  }, [closePeer, isPaired, masterConnected, reportAvailability, startNegotiation]);

  useEffect(() => {
    if (!lastEvent || lastEvent.type !== "vocalInputSignalFromMaster") return;
    if (lastEvent.pairedSlaveId !== pairedSlaveId || !peerRef.current) return;

    if (lastEvent.signal.kind === "answer") {
      peerRef.current
        .setRemoteDescription(lastEvent.signal.description)
        .then(() => flushPendingIceCandidates(peerRef.current, pendingIceCandidatesRef.current))
        .catch((error: unknown) => {
          console.warn("AI-KTV vocal input answer rejected", error);
        });
    }

    if (lastEvent.signal.kind === "iceCandidate") {
      addOrQueueIceCandidate(peerRef.current, pendingIceCandidatesRef.current, lastEvent.signal.candidate);
    }
  }, [lastEvent, pairedSlaveId]);

  return { message, permissionState };
}

function addOrQueueIceCandidate(
  peer: RTCPeerConnection,
  pendingIceCandidates: RTCIceCandidateInit[],
  candidate: RTCIceCandidateInit
): void {
  if (!peer.remoteDescription) {
    pendingIceCandidates.push(candidate);
    return;
  }

  peer.addIceCandidate(candidate).catch((error: unknown) => {
    console.warn("AI-KTV vocal input ICE candidate rejected", error);
  });
}

function flushPendingIceCandidates(
  peer: RTCPeerConnection | null,
  pendingIceCandidates: RTCIceCandidateInit[]
): Promise<void[]> {
  if (!peer) return Promise.resolve([]);
  const candidates = pendingIceCandidates.splice(0);
  return Promise.all(
    candidates.map((candidate) =>
      peer.addIceCandidate(candidate).catch((error: unknown) => {
        console.warn("AI-KTV queued vocal input ICE candidate rejected", error);
      })
    )
  );
}
