import { describe, expect, it } from "vitest";
import { KtvRoom } from "../src/room";
import { seededSongLibrary } from "../src/songs";

describe("KtvRoom", () => {
  it("generates a four digit pairing code", () => {
    expect(new KtvRoom().getState().pairingCode).toMatch(/^\d{4}$/);
  });

  it("allows at most two paired slaves", () => {
    const room = new KtvRoom({ pairingCode: "1234" });

    expect(pair(room, "device-a").ok).toBe(true);
    expect(pair(room, "device-b").ok).toBe(true);
    expect(pair(room, "device-c").ok).toBe(false);
  });

  it("keeps a slave slot during the reconnection grace period", () => {
    let now = 1_000;
    const room = new KtvRoom({ pairingCode: "1234", clock: () => now });
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
    const room = new KtvRoom({ pairingCode: "1234", clock: () => now });
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
    const room = new KtvRoom({ pairingCode: "1234" });
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
    const room = new KtvRoom({ pairingCode: "1234" });
    const pairedSlaveId = pairedSlave(room, "device-a");

    room.addSongToQueue(pairedSlaveId, seededSongLibrary[0].id);
    room.addSongToQueue(pairedSlaveId, seededSongLibrary[1].id);
    const snapshot = room.getState();

    snapshot.playbackQueue.length = 0;
    snapshot.songLibrary.length = 0;
    snapshot.slaveSlots[0].displayLabel = "mutated";
    if (snapshot.currentSong) {
      snapshot.currentSong.attribution.displayText = "mutated";
    }

    const nextSnapshot = room.getState();
    expect(nextSnapshot.playbackQueue).toHaveLength(1);
    expect(nextSnapshot.songLibrary).toHaveLength(seededSongLibrary.length);
    expect(nextSnapshot.slaveSlots[0].displayLabel).toBe("1号位");
    expect(nextSnapshot.currentSong?.attribution.displayText).toBe("1号位");
  });

  it("pins a queued song to next without changing the current song", () => {
    const room = new KtvRoom({ pairingCode: "1234" });
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
    const room = new KtvRoom({ pairingCode: "1234" });
    const pairedSlaveId = pairedSlave(room, "device-a");

    room.addSongToQueue(pairedSlaveId, seededSongLibrary[0].id);
    room.addSongToQueue(pairedSlaveId, seededSongLibrary[1].id);
    room.skipCurrentSong(pairedSlaveId);

    expect(room.getState().currentSong?.song.id).toBe(seededSongLibrary[1].id);
  });

  it("advances when the master reports the current song ended", () => {
    const room = new KtvRoom({ pairingCode: "1234" });
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
    const room = new KtvRoom({ pairingCode: "1234" });
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
    const room = new KtvRoom({ pairingCode: "1234" });
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
    const room = new KtvRoom({ pairingCode: "1234" });
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
    const room = new KtvRoom({ pairingCode: "1234", clock: () => now });
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

  it("updates singing mode and volume state", () => {
    const room = new KtvRoom({ pairingCode: "1234" });
    const pairedSlaveId = pairedSlave(room, "device-a");

    room.changeSingingMode(pairedSlaveId, "accompaniment");
    room.setAccompanimentVolume(pairedSlaveId, 42);
    room.setVocalVolume(pairedSlaveId, 88);
    room.setVocalInputAvailability(pairedSlaveId, "available");
    room.setVocalInputState(pairedSlaveId, "singing");

    const state = room.getState();
    expect(state.singingMode).toBe("accompaniment");
    expect(state.accompanimentVolume).toBe(42);
    expect(state.slaveSlots[0].vocalVolume).toBe(88);
    expect(state.slaveSlots[0].vocalInputAvailability).toBe("available");
    expect(state.slaveSlots[0].vocalInputState).toBe("singing");
  });

  it("rejects singing while vocal input is unavailable", () => {
    const room = new KtvRoom({ pairingCode: "1234" });
    const pairedSlaveId = pairedSlave(room, "device-a");

    expect(room.setVocalInputState(pairedSlaveId, "singing").ok).toBe(false);
    expect(room.getState().slaveSlots[0].vocalInputState).toBe("idle");
  });

  it("forces vocal input state idle when availability is interrupted", () => {
    const room = new KtvRoom({ pairingCode: "1234" });
    const pairedSlaveId = pairedSlave(room, "device-a");

    room.setVocalInputAvailability(pairedSlaveId, "available");
    room.setVocalInputState(pairedSlaveId, "singing");
    room.setVocalInputAvailability(pairedSlaveId, "interrupted");

    const slot = room.getState().slaveSlots[0];
    expect(slot.vocalInputAvailability).toBe("interrupted");
    expect(slot.vocalInputState).toBe("idle");
  });

  it("interrupts available vocal inputs when the master disconnects", () => {
    const room = new KtvRoom({ pairingCode: "1234" });
    const pairedSlaveId = pairedSlave(room, "device-a");

    room.connectMaster();
    room.setVocalInputAvailability(pairedSlaveId, "available");
    room.setVocalInputState(pairedSlaveId, "singing");
    room.disconnectMaster();

    const slot = room.getState().slaveSlots[0];
    expect(slot.vocalInputAvailability).toBe("interrupted");
    expect(slot.vocalInputState).toBe("idle");
  });

  it("starts in accompaniment mode and keeps singing mode across song changes", () => {
    const room = new KtvRoom({ pairingCode: "1234" });
    const pairedSlaveId = pairedSlave(room, "device-a");

    expect(room.getState().singingMode).toBe("accompaniment");

    room.changeSingingMode(pairedSlaveId, "originalVocal");
    room.addSongToQueue(pairedSlaveId, seededSongLibrary[0].id);
    room.addSongToQueue(pairedSlaveId, seededSongLibrary[1].id);
    room.skipCurrentSong(pairedSlaveId);

    expect(room.getState().currentSong?.song.id).toBe(seededSongLibrary[1].id);
    expect(room.getState().singingMode).toBe("originalVocal");
  });
});

function pair(room: KtvRoom, deviceId: string, displayName?: string) {
  return room.pairSlave({ deviceId, pairingCode: "1234", displayName });
}

function pairedSlave(room: KtvRoom, deviceId: string, displayName?: string): string {
  const result = pair(room, deviceId, displayName);
  if (!result.ok) throw new Error(result.reason);
  return result.value.pairedSlaveId;
}
