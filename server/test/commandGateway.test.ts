import { describe, expect, it } from "vitest";
import { handleClientCommand, type ConnectionRole } from "../src/commandGateway";
import { KtvRoom } from "../src/room";
import { seededSongLibrary } from "../src/songs";

describe("handleClientCommand", () => {
  it("accepts a master and asks the transport to broadcast state", () => {
    const room = testRoom();

    const outcome = handleClientCommand(room, unknownRole, { type: "registerMaster" });

    expect(outcome.nextRole).toEqual({ kind: "master" });
    expect(outcome.broadcastState).toBe(true);
    expect(outcome.events[0]).toMatchObject({ type: "masterAccepted" });
  });

  it("pairs a slave and returns the paired event without transport knowledge", () => {
    const room = testRoom();

    const outcome = handleClientCommand(room, unknownRole, {
      type: "pairSlave",
      deviceId: "device-a",
      pairingCode: "1234",
      displayName: "阿杰"
    });

    expect(outcome.nextRole).toMatchObject({ kind: "slave" });
    expect(outcome.broadcastState).toBe(true);
    expect(outcome.events[0]).toMatchObject({ type: "paired", slotNumber: 1 });
  });

  it("rejects master playback reports from non-master connections", () => {
    const room = testRoom();

    const outcome = handleClientCommand(room, unknownRole, { type: "reportSongEnd", queueId: "queued-1" });

    expect(outcome.broadcastState).toBe(false);
    expect(outcome.events).toEqual([
      { type: "commandRejected", command: "reportSongEnd", reason: "只有 Master 可以报告播放状态" }
    ]);
  });

  it("runs room commands through KtvRoom and preserves command rejection reasons", () => {
    const room = testRoom();

    const outcome = handleClientCommand(room, unknownRole, {
      type: "addSongToQueue",
      pairedSlaveId: "missing",
      songId: seededSongLibrary[0].id
    });

    expect(outcome.broadcastState).toBe(false);
    expect(outcome.events).toEqual([
      { type: "commandRejected", command: "addSongToQueue", reason: "Slave 未配对或已断开" }
    ]);
  });

  it("returns song search results only to the paired slave command", () => {
    const room = testRoom();
    const paired = handleClientCommand(room, unknownRole, {
      type: "pairSlave",
      deviceId: "device-a",
      pairingCode: "1234",
      displayName: "阿杰"
    });
    expect(paired.nextRole).toMatchObject({ kind: "slave" });
    if (!paired.nextRole || paired.nextRole.kind !== "slave") return;

    const outcome = handleClientCommand(room, paired.nextRole, {
      type: "searchSongs",
      pairedSlaveId: paired.nextRole.pairedSlaveId,
      requestId: "search-1",
      query: "夏夜"
    });

    expect(outcome.broadcastState).toBe(false);
    expect(outcome.events[0]).toMatchObject({
      type: "songSearchResult",
      requestId: "search-1",
      results: [{ id: "song-summer-night", title: "夏夜来信", artist: "林澈" }]
    });
  });

  it("rejects song library refresh from non-master connections", () => {
    const room = testRoom();

    const outcome = handleClientCommand(room, unknownRole, { type: "refreshSongLibrary" });

    expect(outcome.broadcastState).toBe(false);
    expect(outcome.events).toEqual([
      { type: "commandRejected", command: "refreshSongLibrary", reason: "只有 Master 可以刷新曲库" }
    ]);
  });

  it("routes slave vocal input signalling to the master without broadcasting room state", () => {
    const room = testRoom();
    const paired = handleClientCommand(room, unknownRole, {
      type: "pairSlave",
      deviceId: "device-a",
      pairingCode: "1234",
      displayName: "阿杰"
    });
    expect(paired.nextRole).toMatchObject({ kind: "slave" });
    if (!paired.nextRole || paired.nextRole.kind !== "slave") return;

    const outcome = handleClientCommand(room, paired.nextRole, {
      type: "sendVocalInputSignalToMaster",
      pairedSlaveId: paired.nextRole.pairedSlaveId,
      signal: { kind: "offer", description: { type: "offer", sdp: "offer-sdp" } }
    });

    expect(outcome.broadcastState).toBe(false);
    expect(outcome.events).toEqual([]);
    expect(outcome.targetedEvents).toEqual([
      {
        target: "master",
        event: {
          type: "vocalInputSignalFromSlave",
          pairedSlaveId: paired.nextRole.pairedSlaveId,
          signal: { kind: "offer", description: { type: "offer", sdp: "offer-sdp" } }
        }
      }
    ]);
  });

  it("routes master vocal input signalling to the target slave", () => {
    const room = testRoom();

    const outcome = handleClientCommand(room, { kind: "master" }, {
      type: "sendVocalInputSignalToSlave",
      pairedSlaveId: "paired-1",
      signal: { kind: "answer", description: { type: "answer", sdp: "answer-sdp" } }
    });

    expect(outcome.broadcastState).toBe(false);
    expect(outcome.targetedEvents).toEqual([
      {
        target: { kind: "slave", pairedSlaveId: "paired-1" },
        event: {
          type: "vocalInputSignalFromMaster",
          pairedSlaveId: "paired-1",
          signal: { kind: "answer", description: { type: "answer", sdp: "answer-sdp" } }
        }
      }
    ]);
  });
});

const unknownRole: ConnectionRole = { kind: "unknown" };

function testRoom(): KtvRoom {
  return new KtvRoom({ pairingCode: "1234", songLibrary: seededSongLibrary });
}
