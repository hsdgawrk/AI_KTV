export type SingingMode = "originalVocal" | "accompaniment";
export type ConnectionState = "empty" | "connected" | "disconnected";

export type Song = {
  id: string;
  title: string;
  artist: string;
  language?: "zh" | "ja" | "en" | "other";
  mvUrl?: string;
  lyrics: TimedLyricLine[];
  originalVocalUrl: string;
  accompanimentUrl: string;
};

export type SongSearchResultItem = {
  id: string;
  title: string;
  artist: string;
  language?: Song["language"];
};

export type SongLibraryRefreshIssue = {
  level: "blocking" | "nonBlocking";
  source: string;
  message: string;
};

export type SongLibraryRefreshSummary = {
  status: "success" | "failed";
  songCount: number;
  blockingIssueCount: number;
  nonBlockingIssueCount: number;
  issues: SongLibraryRefreshIssue[];
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
  disconnectedUntil?: number;
};

export type MasterState = {
  connected: boolean;
};

export type KtvRoomState = {
  pairingCode: string;
  master: MasterState;
  slaveSlots: [SlaveSlot, SlaveSlot];
  songLibraryCount: number;
  songLibraryVersion: number;
  playbackQueue: QueuedSong[];
  currentSong?: QueuedSong;
  singingMode: SingingMode;
  accompanimentVolume: number;
};

export type ClientCommand =
  | { type: "registerMaster" }
  | { type: "pairSlave"; deviceId: string; pairingCode: string; displayName?: string }
  | { type: "renameSlave"; pairedSlaveId: string; displayName?: string }
  | { type: "searchSongs"; pairedSlaveId: string; requestId: string; query: string }
  | { type: "addSongToQueue"; pairedSlaveId: string; songId: string }
  | { type: "pinQueuedSongToNext"; pairedSlaveId: string; queueId: string }
  | { type: "removeQueuedSong"; pairedSlaveId: string; queueId: string }
  | { type: "skipCurrentSong"; pairedSlaveId: string }
  | { type: "refreshSongLibrary" }
  | { type: "changeSingingMode"; pairedSlaveId: string; singingMode: SingingMode }
  | { type: "setAccompanimentVolume"; pairedSlaveId: string; volume: number }
  | { type: "reportSongEnd"; queueId: string }
  | { type: "reportUnplayableSong"; queueId: string };

export type ServerEvent =
  | { type: "roomState"; state: KtvRoomState }
  | { type: "paired"; pairedSlaveId: string; slotNumber: 1 | 2; state: KtvRoomState }
  | { type: "masterAccepted"; state: KtvRoomState }
  | {
      type: "songSearchResult";
      requestId: string;
      query: string;
      results: SongSearchResultItem[];
      hasMore: boolean;
      songLibraryVersion: number;
    }
  | { type: "songLibraryRefreshResult"; summary: SongLibraryRefreshSummary; songLibraryVersion: number }
  | { type: "commandRejected"; command: ClientCommand["type"]; reason: string };
