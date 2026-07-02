export type SingingMode = "originalVocal" | "accompaniment";
export type VocalInputAvailability = "unavailable" | "available" | "interrupted";
export type VocalInputState = "idle" | "singing";
export type ConnectionState = "empty" | "connected" | "disconnected";

export type Song = {
  id: string;
  title: string;
  artist: string;
  language?: "zh" | "ja" | "en" | "other";
  mvUrl: string;
  lyrics: TimedLyricLine[];
  originalVocalUrl: string;
  accompanimentUrl: string;
};

export type TimedLyricLine = {
  startTimeMs: number;
  text: string;
  romanizedText?: string;
  translationText?: string;
};

export type QueuedSongAttribution = {
  displayText: string;
};

export type QueuedSong = {
  queueId: string;
  song: Song;
  attribution: QueuedSongAttribution;
  ownerPairedSlaveId: string;
};

export type SlaveSlot = {
  slotNumber: 1 | 2;
  pairedSlaveId?: string;
  displayName?: string;
  displayLabel: string;
  connectionState: ConnectionState;
  vocalInputAvailability: VocalInputAvailability;
  vocalVolume: number;
  vocalInputState: VocalInputState;
  disconnectedUntil?: number;
};

export type MasterState = {
  connected: boolean;
};

export type KtvRoomState = {
  pairingCode: string;
  master: MasterState;
  slaveSlots: [SlaveSlot, SlaveSlot];
  songLibrary: Song[];
  playbackQueue: QueuedSong[];
  currentSong?: QueuedSong;
  singingMode: SingingMode;
  accompanimentVolume: number;
};

export type VocalInputSignal =
  | { kind: "offer"; description: RTCSessionDescriptionInit }
  | { kind: "answer"; description: RTCSessionDescriptionInit }
  | { kind: "iceCandidate"; candidate: RTCIceCandidateInit };

export type ClientCommand =
  | { type: "registerMaster" }
  | { type: "pairSlave"; deviceId: string; pairingCode: string; displayName?: string }
  | { type: "renameSlave"; pairedSlaveId: string; displayName?: string }
  | { type: "addSongToQueue"; pairedSlaveId: string; songId: string }
  | { type: "pinQueuedSongToNext"; pairedSlaveId: string; queueId: string }
  | { type: "removeQueuedSong"; pairedSlaveId: string; queueId: string }
  | { type: "skipCurrentSong"; pairedSlaveId: string }
  | { type: "changeSingingMode"; pairedSlaveId: string; singingMode: SingingMode }
  | { type: "setAccompanimentVolume"; pairedSlaveId: string; volume: number }
  | { type: "setVocalVolume"; pairedSlaveId: string; volume: number }
  | { type: "setVocalInputAvailability"; pairedSlaveId: string; availability: VocalInputAvailability }
  | { type: "setVocalInputState"; pairedSlaveId: string; state: VocalInputState }
  | { type: "sendVocalInputSignalToMaster"; pairedSlaveId: string; signal: VocalInputSignal }
  | { type: "sendVocalInputSignalToSlave"; pairedSlaveId: string; signal: VocalInputSignal }
  | { type: "reportSongEnd"; queueId: string }
  | { type: "reportUnplayableSong"; queueId: string };

export type ServerEvent =
  | { type: "roomState"; state: KtvRoomState }
  | { type: "paired"; pairedSlaveId: string; slotNumber: 1 | 2; state: KtvRoomState }
  | { type: "masterAccepted"; state: KtvRoomState }
  | { type: "vocalInputSignalFromSlave"; pairedSlaveId: string; signal: VocalInputSignal }
  | { type: "vocalInputSignalFromMaster"; pairedSlaveId: string; signal: VocalInputSignal }
  | { type: "commandRejected"; command: ClientCommand["type"]; reason: string };
