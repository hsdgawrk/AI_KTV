import { describe, expect, it } from "vitest";
import { handleClientCommand, type ConnectionRole } from "../src/commandGateway";
import { KtvRoom } from "../src/room";
import { seededSongLibrary } from "../src/songs";

describe("handleClientCommand", () => {
  it("accepts a master and asks the transport to broadcast state", () => {
    const room = new KtvRoom({ pairingCode: "1234" });

    const outcome = handleClientCommand(room, unknownRole, { type: "registerMaster" });

    expect(outcome.nextRole).toEqual({ kind: "master" });
    expect(outcome.broadcastState).toBe(true);
    expect(outcome.events[0]).toMatchObject({ type: "masterAccepted" });
  });

  it("pairs a slave and returns the paired event without transport knowledge", () => {
    const room = new KtvRoom({ pairingCode: "1234" });

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
    const room = new KtvRoom({ pairingCode: "1234" });

    const outcome = handleClientCommand(room, unknownRole, { type: "reportSongEnd", queueId: "queued-1" });

    expect(outcome.broadcastState).toBe(false);
    expect(outcome.events).toEqual([
      { type: "commandRejected", command: "reportSongEnd", reason: "只有 Master 可以报告播放状态" }
    ]);
  });

  it("runs room commands through KtvRoom and preserves command rejection reasons", () => {
    const room = new KtvRoom({ pairingCode: "1234" });

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
});

const unknownRole: ConnectionRole = { kind: "unknown" };
