import { describe, expect, it } from "vitest";
import type { Song } from "../../shared/protocol";
import { KtvRoom } from "../src/room";
import type { SongLibrarySnapshot } from "../src/songLibrary";
import { seededSongLibrary } from "../src/songs";

describe("KtvRoom", () => {
  it("generates a four digit pairing code", () => {
    expect(new KtvRoom().getState().pairingCode).toMatch(/^\d{4}$/);
  });

  it("allows at most two paired slaves", () => {
    const room = testRoom();

    expect(pair(room, "device-a").ok).toBe(true);
    expect(pair(room, "device-b").ok).toBe(true);
    expect(pair(room, "device-c").ok).toBe(false);
  });

  it("keeps a slave slot during the reconnection grace period", () => {
    let now = 1_000;
    const room = testRoom({ clock: () => now });
    const paired = pair(room, "device-a");
    expect(paired.ok).toBe(true);
    if (!paired.ok) return;

    room.disconnectSlave(paired.value.pairedSlaveId);
    now += room.reconnectionGracePeriodMs - 1;

    const reconnected = room.pairSlave({ deviceId: "device-a", pairingCode: "", displayName: undefined });
    expect(reconnected.ok).toBe(true);
    expect(reconnected.ok && reconnected.value.slotNumber).toBe(1);
  });

  it("releases a slave slot after the reconnection grace period", () => {
    let now = 1_000;
    const room = testRoom({ clock: () => now });
    const paired = pair(room, "device-a");
    expect(paired.ok).toBe(true);
    if (!paired.ok) return;

    room.disconnectSlave(paired.value.pairedSlaveId);
    now += room.reconnectionGracePeriodMs + 1;
    room.expireDisconnectedSlaves();

    expect(room.getState().slaveSlots[0].connectionState).toBe("empty");
    expect(room.pairSlave({ deviceId: "device-a", pairingCode: "", displayName: undefined }).ok).toBe(false);
  });

  it("allows the same song to appear as separate queued songs", () => {
    const room = testRoom();
    const pairedSlaveId = pairedSlave(room, "device-a");
    const songId = seededSongLibrary[0].id;

    room.addSongToQueue(pairedSlaveId, songId);
    room.addSongToQueue(pairedSlaveId, songId);
    room.addSongToQueue(pairedSlaveId, songId);

    const state = room.getState();
    expect(state.currentSong?.song.id).toBe(songId);
    expect(state.playbackQueue).toHaveLength(2);
    expect(new Set(state.playbackQueue.map((queuedSong) => queuedSong.queueId)).size).toBe(2);
  });

  it("returns room state snapshots without exposing mutable room arrays", () => {
    const room = testRoom();
    const pairedSlaveId = pairedSlave(room, "device-a");

    room.addSongToQueue(pairedSlaveId, seededSongLibrary[0].id);
    room.addSongToQueue(pairedSlaveId, seededSongLibrary[1].id);
    const snapshot = room.getState();

    snapshot.playbackQueue.length = 0;
    snapshot.songLibraryCount = 0;
    snapshot.slaveSlots[0].displayLabel = "mutated";
    if (snapshot.currentSong) {
      snapshot.currentSong.attribution.displayText = "mutated";
      snapshot.currentSong.song.title = "mutated";
    }

    const nextSnapshot = room.getState();
    expect(nextSnapshot.playbackQueue).toHaveLength(1);
    expect(nextSnapshot.songLibraryCount).toBe(seededSongLibrary.length);
    expect(nextSnapshot.slaveSlots[0].displayLabel).toBe("1号位");
    expect(nextSnapshot.currentSong?.attribution.displayText).toBe("1号位");
    expect(nextSnapshot.currentSong?.song.title).toBe(seededSongLibrary[0].title);
  });

  it("pins a queued song to next without changing the current song", () => {
    const room = testRoom();
    const pairedSlaveId = pairedSlave(room, "device-a");

    room.addSongToQueue(pairedSlaveId, seededSongLibrary[0].id);
    room.addSongToQueue(pairedSlaveId, seededSongLibrary[1].id);
    room.addSongToQueue(pairedSlaveId, seededSongLibrary[2].id);
    const target = room.getState().playbackQueue[1];

    room.pinQueuedSongToNext(pairedSlaveId, target.queueId);

    const state = room.getState();
    expect(state.currentSong?.song.id).toBe(seededSongLibrary[0].id);
    expect(state.playbackQueue[0].queueId).toBe(target.queueId);
  });

  it("skips the current song and promotes the next queued song", () => {
    const room = testRoom();
    const pairedSlaveId = pairedSlave(room, "device-a");

    room.addSongToQueue(pairedSlaveId, seededSongLibrary[0].id);
    room.addSongToQueue(pairedSlaveId, seededSongLibrary[1].id);
    room.skipCurrentSong(pairedSlaveId);

    expect(room.getState().currentSong?.song.id).toBe(seededSongLibrary[1].id);
  });

  it("rejects skipping when there is no current song", () => {
    const room = testRoom();
    const pairedSlaveId = pairedSlave(room, "device-a");

    expect(room.skipCurrentSong(pairedSlaveId)).toEqual({ ok: false, reason: "当前没有播放歌曲" });
  });

  it("advances when the master reports the current song ended", () => {
    const room = testRoom();
    const pairedSlaveId = pairedSlave(room, "device-a");

    room.addSongToQueue(pairedSlaveId, seededSongLibrary[0].id);
    room.addSongToQueue(pairedSlaveId, seededSongLibrary[1].id);
    const currentQueueId = room.getState().currentSong?.queueId;
    expect(currentQueueId).toBeTruthy();
    if (!currentQueueId) return;

    room.reportSongEnd(currentQueueId);

    expect(room.getState().currentSong?.song.id).toBe(seededSongLibrary[1].id);
  });

  it("ignores stale master song end reports", () => {
    const room = testRoom();
    const pairedSlaveId = pairedSlave(room, "device-a");

    room.addSongToQueue(pairedSlaveId, seededSongLibrary[0].id);
    room.addSongToQueue(pairedSlaveId, seededSongLibrary[1].id);
    room.addSongToQueue(pairedSlaveId, seededSongLibrary[2].id);
    const staleQueueId = room.getState().currentSong?.queueId;
    expect(staleQueueId).toBeTruthy();
    if (!staleQueueId) return;

    room.skipCurrentSong(pairedSlaveId);
    room.reportSongEnd(staleQueueId);

    expect(room.getState().currentSong?.song.id).toBe(seededSongLibrary[1].id);
  });

  it("skips an unplayable current song", () => {
    const room = testRoom();
    const pairedSlaveId = pairedSlave(room, "device-a");

    room.addSongToQueue(pairedSlaveId, seededSongLibrary[0].id);
    room.addSongToQueue(pairedSlaveId, seededSongLibrary[1].id);
    const currentQueueId = room.getState().currentSong?.queueId;
    expect(currentQueueId).toBeTruthy();
    if (!currentQueueId) return;

    room.reportUnplayableSong(currentQueueId);

    expect(room.getState().currentSong?.song.id).toBe(seededSongLibrary[1].id);
  });

  it("only removes queued songs owned by the paired slave", () => {
    const room = testRoom();
    const slaveA = pairedSlave(room, "device-a", "阿杰");
    const slaveB = pairedSlave(room, "device-b", "小林");

    room.addSongToQueue(slaveA, seededSongLibrary[0].id);
    room.addSongToQueue(slaveA, seededSongLibrary[1].id);
    const queuedSong = room.getState().playbackQueue[0];

    expect(room.removeQueuedSong(slaveB, queuedSong.queueId).ok).toBe(false);
    expect(room.removeQueuedSong(slaveA, queuedSong.queueId).ok).toBe(true);
    expect(room.getState().playbackQueue).toHaveLength(0);
  });

  it("does not let a later slave inherit removal rights from a reused slot", () => {
    let now = 1_000;
    const room = testRoom({ clock: () => now });
    const slaveA = pairedSlave(room, "device-a", "阿杰");
    room.addSongToQueue(slaveA, seededSongLibrary[0].id);
    room.addSongToQueue(slaveA, seededSongLibrary[1].id);
    const queuedSong = room.getState().playbackQueue[0];

    room.disconnectSlave(slaveA);
    now += room.reconnectionGracePeriodMs + 1;
    room.expireDisconnectedSlaves();
    const slaveB = pairedSlave(room, "device-b", "小林");

    expect(room.getState().slaveSlots[0].displayLabel).toBe("小林");
    expect(queuedSong.attribution.displayText).toBe("阿杰");
    expect(room.removeQueuedSong(slaveB, queuedSong.queueId).ok).toBe(false);
  });

  it("updates singing mode and accompaniment volume state", () => {
    const room = testRoom();
    const pairedSlaveId = pairedSlave(room, "device-a");

    room.changeSingingMode(pairedSlaveId, "accompaniment");
    room.setAccompanimentVolume(pairedSlaveId, 42);

    const state = room.getState();
    expect(state.singingMode).toBe("accompaniment");
    expect(state.accompanimentVolume).toBe(42);
  });

  it("starts in accompaniment mode and keeps singing mode across song changes", () => {
    const room = testRoom();
    const pairedSlaveId = pairedSlave(room, "device-a");

    expect(room.getState().singingMode).toBe("accompaniment");

    room.changeSingingMode(pairedSlaveId, "originalVocal");
    room.addSongToQueue(pairedSlaveId, seededSongLibrary[0].id);
    room.addSongToQueue(pairedSlaveId, seededSongLibrary[1].id);
    room.skipCurrentSong(pairedSlaveId);

    expect(room.getState().currentSong?.song.id).toBe(seededSongLibrary[1].id);
    expect(room.getState().singingMode).toBe("originalVocal");
  });

  it("searches songs on the server and ranks title prefix matches first", () => {
    const room = new KtvRoom({
      pairingCode: "1234",
      songLibrary: [
        testSong("city-lights", "城市灯火", "北岸乐队"),
        testSong("night-city", "夜色城市", "林澈"),
        testSong("harbor", "港口", "城市民谣")
      ]
    });
    const pairedSlaveId = pairedSlave(room, "device-a");

    const result = room.searchSongs(pairedSlaveId, "城市");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.results.map((song) => song.id)).toEqual(["city-lights", "night-city", "harbor"]);
    expect(result.value.hasMore).toBe(false);
  });

  it("keeps the previous song library when refresh finds no usable songs", () => {
    let loadCount = 0;
    const initial = snapshotFor([testSong("one", "第一首", "林澈")], "success");
    const empty = snapshotFor([], "failed");
    const room = new KtvRoom({
      pairingCode: "1234",
      loadSongLibrary: () => (loadCount++ === 0 ? initial : empty)
    });

    const result = room.refreshSongLibrary();

    expect(result.ok).toBe(true);
    expect(room.getState().songLibraryCount).toBe(1);
    expect(room.getState().songLibraryVersion).toBe(1);
    expect(result.ok && result.value.status).toBe("failed");
  });
});

function pair(room: KtvRoom, deviceId: string, displayName?: string) {
  return room.pairSlave({ deviceId, pairingCode: "1234", displayName });
}

function testRoom(options: { clock?: () => number } = {}): KtvRoom {
  return new KtvRoom({ pairingCode: "1234", songLibrary: seededSongLibrary, ...options });
}

function testSong(id: string, title: string, artist: string): Song {
  return {
    id,
    title,
    artist,
    lyrics: [],
    originalVocalUrl: `/media/songs/${id}/originalVocal`,
    accompanimentUrl: `/media/songs/${id}/accompaniment`
  };
}

function snapshotFor(songs: Song[], status: "success" | "failed"): SongLibrarySnapshot {
  return {
    songs,
    searchEntries: songs.map((song) => ({
      song,
      summary: { id: song.id, title: song.title, artist: song.artist },
      stableSortKey: song.title,
      normalizedTitle: song.title,
      normalizedArtist: song.artist,
      normalizedSearchText: `${song.title} ${song.artist}`
    })),
    assets: new Map(),
    summary: {
      status,
      songCount: songs.length,
      blockingIssueCount: status === "failed" ? 1 : 0,
      nonBlockingIssueCount: 0,
      issues: status === "failed" ? [{ level: "blocking", source: ".", message: "没有可用歌曲" }] : []
    }
  };
}

function pairedSlave(room: KtvRoom, deviceId: string, displayName?: string): string {
  const result = pair(room, deviceId, displayName);
  if (!result.ok) throw new Error(result.reason);
  return result.value.pairedSlaveId;
}
