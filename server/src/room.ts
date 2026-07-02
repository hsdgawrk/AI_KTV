import type {
  ConnectionState,
  KtvRoomState,
  QueuedSong,
  SingingMode,
  SlaveSlot,
  Song,
  SongLibraryRefreshSummary,
  SongSearchResultItem,
  VocalInputAvailability,
  VocalInputState
} from "../../shared/protocol";
import { seededSongLibrary } from "./songs";
import {
  assetKey,
  loadSongLibraryFromDirectory,
  normalizeSearchText,
  type SongLibrarySnapshot,
  type SongSearchEntry
} from "./songLibrary";

const RECONNECTION_GRACE_PERIOD_MS = 60_000;
const DEFAULT_VOLUME = 70;

type Clock = () => number;

type PairedSlaveRecord = {
  pairedSlaveId: string;
  deviceId: string;
  slotNumber: 1 | 2;
  active: boolean;
};

type CommandResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

export class KtvRoom {
  private readonly clock: Clock;
  private readonly loadSongLibrary: () => SongLibrarySnapshot;
  private readonly pairedSlaves = new Map<string, PairedSlaveRecord>();
  private songLibrary: Song[];
  private songSearchEntries: SongSearchEntry[];
  private songAssets: Map<string, string>;
  private songLibraryVersion = 1;
  private latestSongLibraryRefresh: SongLibraryRefreshSummary;
  private readonly slaveSlots: [SlaveSlot, SlaveSlot];
  private pairingCode: string;
  private masterConnected = false;
  private playbackQueue: QueuedSong[] = [];
  private currentSong?: QueuedSong;
  private singingMode: SingingMode = "accompaniment";
  private accompanimentVolume = DEFAULT_VOLUME;
  private sequence = 1;

  constructor(options: { clock?: Clock; songLibrary?: Song[]; pairingCode?: string; loadSongLibrary?: () => SongLibrarySnapshot } = {}) {
    this.clock = options.clock ?? Date.now;
    this.loadSongLibrary = options.loadSongLibrary ?? loadSongLibraryFromDirectory;
    const initialLibrary = options.songLibrary ? snapshotFromSongs(options.songLibrary) : this.loadSongLibrary();
    this.songLibrary = initialLibrary.songs;
    this.songSearchEntries = initialLibrary.searchEntries;
    this.songAssets = initialLibrary.assets;
    this.latestSongLibraryRefresh = initialLibrary.summary;
    this.pairingCode = options.pairingCode ?? this.generatePairingCode();
    this.slaveSlots = [this.createEmptySlot(1), this.createEmptySlot(2)];
  }

  get reconnectionGracePeriodMs(): number {
    return RECONNECTION_GRACE_PERIOD_MS;
  }

  getState(): KtvRoomState {
    this.expireDisconnectedSlaves();
    this.normalizeCurrentSong();

    return {
      pairingCode: this.pairingCode,
      master: { connected: this.masterConnected },
      slaveSlots: this.slaveSlots.map((slot) => ({ ...slot })) as [SlaveSlot, SlaveSlot],
      songLibraryCount: this.songLibrary.length,
      songLibraryVersion: this.songLibraryVersion,
      playbackQueue: this.playbackQueue.map(snapshotQueuedSong),
      currentSong: this.currentSong ? snapshotQueuedSong(this.currentSong) : undefined,
      singingMode: this.singingMode,
      accompanimentVolume: this.accompanimentVolume
    };
  }

  connectMaster(): CommandResult {
    if (this.masterConnected) {
      return { ok: false, reason: "已有主屏连接" };
    }

    this.masterConnected = true;
    return { ok: true, value: undefined };
  }

  getLatestSongLibraryRefresh(): SongLibraryRefreshSummary {
    return {
      ...this.latestSongLibraryRefresh,
      issues: this.latestSongLibraryRefresh.issues.map((issue) => ({ ...issue }))
    };
  }

  refreshSongLibrary(): CommandResult<SongLibraryRefreshSummary> {
    const nextLibrary = this.loadSongLibrary();
    const keepPrevious = this.songLibrary.length > 0 && nextLibrary.songs.length === 0;
    if (!keepPrevious) {
      this.songLibrary = nextLibrary.songs;
      this.songSearchEntries = nextLibrary.searchEntries;
      this.songAssets = nextLibrary.assets;
      this.songLibraryVersion += 1;
      this.latestSongLibraryRefresh = nextLibrary.summary;
      return { ok: true, value: this.getLatestSongLibraryRefresh() };
    }

    this.latestSongLibraryRefresh = {
      ...nextLibrary.summary,
      status: "failed",
      songCount: this.songLibrary.length
    };
    return { ok: true, value: this.getLatestSongLibraryRefresh() };
  }

  searchSongs(pairedSlaveId: string, query: string): CommandResult<{
    results: SongSearchResultItem[];
    hasMore: boolean;
    songLibraryVersion: number;
  }> {
    const record = this.requireConnectedSlave(pairedSlaveId);
    if (!record.ok) return record;

    const normalizedQuery = normalizeSearchText(query);
    const matches = normalizedQuery ? this.searchRanked(normalizedQuery) : [...this.songSearchEntries];
    const limited = matches.slice(0, 50);
    return {
      ok: true,
      value: {
        results: limited.map((entry) => ({ ...entry.summary })),
        hasMore: matches.length > limited.length,
        songLibraryVersion: this.songLibraryVersion
      }
    };
  }

  resolveSongAsset(songId: string, assetName: string): string | undefined {
    return this.songAssets.get(assetKey(songId, assetName));
  }

  disconnectMaster(): void {
    this.masterConnected = false;
    for (const slot of this.slaveSlots) {
      if (slot.connectionState === "connected" && slot.vocalInputAvailability === "available") {
        slot.vocalInputAvailability = "interrupted";
        slot.vocalInputState = "idle";
      }
    }
  }

  pairSlave(input: {
    deviceId: string;
    pairingCode: string;
    displayName?: string;
  }): CommandResult<{ pairedSlaveId: string; slotNumber: 1 | 2 }> {
    this.expireDisconnectedSlaves();

    const existing = this.findPairedSlaveByDeviceId(input.deviceId);
    if (existing) {
      const slot = this.slot(existing.slotNumber);
      existing.active = true;
      slot.connectionState = "connected";
      slot.vocalInputAvailability = "unavailable";
      slot.disconnectedUntil = undefined;
      slot.vocalInputState = "idle";

      return {
        ok: true,
        value: { pairedSlaveId: existing.pairedSlaveId, slotNumber: existing.slotNumber }
      };
    }

    if (input.pairingCode !== this.pairingCode) {
      return { ok: false, reason: "配对码错误" };
    }

    const availableSlot = this.slaveSlots.find((slot) => slot.connectionState === "empty");
    if (!availableSlot) {
      return { ok: false, reason: "房间已满" };
    }

    const pairedSlaveId = this.nextId("paired");
    const displayName = normalizeDisplayName(input.displayName);
    const slotNumber = availableSlot.slotNumber;
    const record: PairedSlaveRecord = {
      pairedSlaveId,
      deviceId: input.deviceId,
      slotNumber,
      active: true
    };

    this.pairedSlaves.set(pairedSlaveId, record);
    Object.assign(availableSlot, {
      pairedSlaveId,
      displayName,
      displayLabel: this.displayLabel(slotNumber, displayName),
      connectionState: "connected" satisfies ConnectionState,
      vocalInputAvailability: "unavailable" satisfies VocalInputAvailability,
      vocalVolume: DEFAULT_VOLUME,
      vocalInputState: "idle" satisfies VocalInputState,
      disconnectedUntil: undefined
    });

    return { ok: true, value: { pairedSlaveId, slotNumber } };
  }

  disconnectSlave(pairedSlaveId: string): void {
    const record = this.pairedSlaves.get(pairedSlaveId);
    if (!record) return;

    const slot = this.slot(record.slotNumber);
    record.active = false;
    slot.connectionState = "disconnected";
    slot.vocalInputAvailability = "unavailable";
    slot.vocalInputState = "idle";
    slot.disconnectedUntil = this.clock() + RECONNECTION_GRACE_PERIOD_MS;
  }

  renameSlave(pairedSlaveId: string, displayName?: string): CommandResult {
    const record = this.requireConnectedSlave(pairedSlaveId);
    if (!record.ok) return record;

    const slot = this.slot(record.value.slotNumber);
    slot.displayName = normalizeDisplayName(displayName);
    slot.displayLabel = this.displayLabel(slot.slotNumber, slot.displayName);
    return { ok: true, value: undefined };
  }

  addSongToQueue(pairedSlaveId: string, songId: string): CommandResult {
    const record = this.requireConnectedSlave(pairedSlaveId);
    if (!record.ok) return record;

    const song = this.songLibrary.find((candidate) => candidate.id === songId);
    if (!song) return { ok: false, reason: "歌曲不存在" };

    const slot = this.slot(record.value.slotNumber);
    const queuedSong: QueuedSong = {
      queueId: this.nextId("queued"),
      song,
      attribution: { displayText: slot.displayLabel },
      ownerPairedSlaveId: pairedSlaveId
    };

    if (this.currentSong) {
      this.playbackQueue.push(queuedSong);
    } else {
      this.currentSong = queuedSong;
    }

    return { ok: true, value: undefined };
  }

  pinQueuedSongToNext(pairedSlaveId: string, queueId: string): CommandResult {
    const record = this.requireConnectedSlave(pairedSlaveId);
    if (!record.ok) return record;

    const index = this.playbackQueue.findIndex((queuedSong) => queuedSong.queueId === queueId);
    if (index === -1) return { ok: false, reason: "队列项不存在" };
    if (index === 0) return { ok: true, value: undefined };

    const [target] = this.playbackQueue.splice(index, 1);
    this.playbackQueue.unshift(target);
    return { ok: true, value: undefined };
  }

  removeQueuedSong(pairedSlaveId: string, queueId: string): CommandResult {
    const record = this.requireConnectedSlave(pairedSlaveId);
    if (!record.ok) return record;

    if (this.currentSong?.queueId === queueId) {
      return { ok: false, reason: "当前歌曲不能删除" };
    }

    const index = this.playbackQueue.findIndex((queuedSong) => queuedSong.queueId === queueId);
    if (index === -1) return { ok: false, reason: "队列项不存在" };

    const queuedSong = this.playbackQueue[index];
    if (queuedSong.ownerPairedSlaveId !== pairedSlaveId) {
      return { ok: false, reason: "只能删除自己点的歌" };
    }

    this.playbackQueue.splice(index, 1);
    this.normalizeCurrentSong();
    return { ok: true, value: undefined };
  }

  skipCurrentSong(pairedSlaveId: string): CommandResult {
    const record = this.requireConnectedSlave(pairedSlaveId);
    if (!record.ok) return record;
    if (!this.currentSong) return { ok: false, reason: "当前没有播放歌曲" };

    this.currentSong = this.playbackQueue.shift();
    return { ok: true, value: undefined };
  }

  reportSongEnd(queueId: string): CommandResult {
    this.advanceCurrentSongIfMatched(queueId);
    return { ok: true, value: undefined };
  }

  reportUnplayableSong(queueId: string): CommandResult {
    this.advanceCurrentSongIfMatched(queueId);
    return { ok: true, value: undefined };
  }

  changeSingingMode(pairedSlaveId: string, singingMode: SingingMode): CommandResult {
    const record = this.requireConnectedSlave(pairedSlaveId);
    if (!record.ok) return record;
    this.singingMode = singingMode;
    return { ok: true, value: undefined };
  }

  setAccompanimentVolume(pairedSlaveId: string, volume: number): CommandResult {
    const record = this.requireConnectedSlave(pairedSlaveId);
    if (!record.ok) return record;
    this.accompanimentVolume = clampVolume(volume);
    return { ok: true, value: undefined };
  }

  setVocalVolume(pairedSlaveId: string, volume: number): CommandResult {
    const record = this.requireConnectedSlave(pairedSlaveId);
    if (!record.ok) return record;
    this.slot(record.value.slotNumber).vocalVolume = clampVolume(volume);
    return { ok: true, value: undefined };
  }

  setVocalInputAvailability(pairedSlaveId: string, availability: VocalInputAvailability): CommandResult {
    const record = this.requireConnectedSlave(pairedSlaveId);
    if (!record.ok) return record;

    const slot = this.slot(record.value.slotNumber);
    slot.vocalInputAvailability = availability;
    if (availability !== "available") {
      slot.vocalInputState = "idle";
    }

    return { ok: true, value: undefined };
  }

  setVocalInputState(pairedSlaveId: string, vocalInputState: VocalInputState): CommandResult {
    const record = this.requireConnectedSlave(pairedSlaveId);
    if (!record.ok) return record;
    const slot = this.slot(record.value.slotNumber);
    if (vocalInputState === "singing" && slot.vocalInputAvailability !== "available") {
      return { ok: false, reason: "Vocal Input 不可用" };
    }

    slot.vocalInputState = vocalInputState;
    return { ok: true, value: undefined };
  }

  expireDisconnectedSlaves(): void {
    const now = this.clock();
    for (const record of this.pairedSlaves.values()) {
      const slot = this.slot(record.slotNumber);
      if (slot.connectionState === "disconnected" && slot.disconnectedUntil && slot.disconnectedUntil <= now) {
        this.pairedSlaves.delete(record.pairedSlaveId);
        Object.assign(slot, this.createEmptySlot(slot.slotNumber));
      }
    }
  }

  private normalizeCurrentSong(): void {
    if (!this.currentSong && this.playbackQueue.length > 0) {
      this.currentSong = this.playbackQueue.shift();
    }
  }

  private advanceCurrentSongIfMatched(queueId: string): void {
    if (this.currentSong?.queueId !== queueId) return;
    this.currentSong = this.playbackQueue.shift();
  }

  private searchRanked(normalizedQuery: string): SongSearchEntry[] {
    return this.songSearchEntries
      .map((entry) => ({ entry, rank: searchRank(entry, normalizedQuery) }))
      .filter((candidate) => candidate.rank !== undefined)
      .sort((left, right) => left.rank! - right.rank! || compareSearchEntryStable(left.entry, right.entry))
      .map((candidate) => candidate.entry);
  }

  private requireConnectedSlave(pairedSlaveId: string): CommandResult<PairedSlaveRecord> {
    this.expireDisconnectedSlaves();
    const record = this.pairedSlaves.get(pairedSlaveId);
    if (!record || !record.active) {
      return { ok: false, reason: "Slave 未配对或已断开" };
    }

    return { ok: true, value: record };
  }

  private findPairedSlaveByDeviceId(deviceId: string): PairedSlaveRecord | undefined {
    for (const record of this.pairedSlaves.values()) {
      if (record.deviceId === deviceId) return record;
    }

    return undefined;
  }

  private slot(slotNumber: 1 | 2): SlaveSlot {
    return this.slaveSlots[slotNumber - 1];
  }

  private createEmptySlot(slotNumber: 1 | 2): SlaveSlot {
    return {
      slotNumber,
      displayLabel: `${slotNumber}号位`,
      connectionState: "empty",
      vocalInputAvailability: "unavailable",
      vocalVolume: DEFAULT_VOLUME,
      vocalInputState: "idle"
    };
  }

  private displayLabel(slotNumber: 1 | 2, displayName?: string): string {
    return displayName || `${slotNumber}号位`;
  }

  private nextId(prefix: string): string {
    return `${prefix}-${this.sequence++}`;
  }

  private generatePairingCode(): string {
    return String(Math.floor(1000 + Math.random() * 9000));
  }
}

function normalizeDisplayName(displayName?: string): string | undefined {
  const normalized = displayName?.trim();
  return normalized ? normalized.slice(0, 16) : undefined;
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(100, Math.round(volume)));
}

function snapshotQueuedSong(queuedSong: QueuedSong): QueuedSong {
  return {
    ...queuedSong,
    song: {
      ...queuedSong.song,
      lyrics: queuedSong.song.lyrics.map((line) => ({ ...line }))
    },
    attribution: { ...queuedSong.attribution }
  };
}

function snapshotFromSongs(songs: Song[]): SongLibrarySnapshot {
  const searchEntries = songs.map((song) => {
    const stableSortKey = normalizeSearchText(`${song.title} ${song.artist} ${song.id}`);
    return {
      song,
      summary: {
        id: song.id,
        title: song.title,
        artist: song.artist,
        ...(song.language ? { language: song.language } : {})
      },
      stableSortKey,
      normalizedTitle: normalizeSearchText(song.title),
      normalizedArtist: normalizeSearchText(song.artist),
      normalizedSearchText: normalizeSearchText(`${song.title} ${song.artist}`)
    };
  });
  searchEntries.sort(compareSearchEntryStable);
  return {
    songs: [...songs],
    searchEntries,
    assets: new Map(),
    summary: {
      status: songs.length > 0 ? "success" : "failed",
      songCount: songs.length,
      blockingIssueCount: 0,
      nonBlockingIssueCount: 0,
      issues: []
    }
  };
}

function searchRank(entry: SongSearchEntry, normalizedQuery: string): number | undefined {
  if (entry.normalizedTitle.startsWith(normalizedQuery)) return 0;
  if (entry.normalizedTitle.includes(normalizedQuery)) return 1;
  if (entry.normalizedArtist.includes(normalizedQuery)) return 2;
  if (entry.normalizedSearchText.includes(normalizedQuery)) return 3;
  return undefined;
}

function compareSearchEntryStable(left: SongSearchEntry, right: SongSearchEntry): number {
  return left.stableSortKey.localeCompare(right.stableSortKey, "zh-Hans") || left.song.id.localeCompare(right.song.id);
}
