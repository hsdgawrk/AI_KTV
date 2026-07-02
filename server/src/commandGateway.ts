import type { ClientCommand, ServerEvent } from "../../shared/protocol";
import type { KtvRoom } from "./room";

export type ConnectionRole =
  | { kind: "unknown" }
  | { kind: "master" }
  | { kind: "slave"; pairedSlaveId: string };

type RoomCommandResult = { ok: true } | { ok: false; reason: string };

type CommandOutcome = {
  nextRole?: ConnectionRole;
  events: ServerEvent[];
  broadcastState: boolean;
};

export function handleClientCommand(room: KtvRoom, role: ConnectionRole, command: ClientCommand): CommandOutcome {
  switch (command.type) {
    case "registerMaster": {
      const result = room.connectMaster();
      if (!result.ok) return rejected(command, result.reason);
      return {
        nextRole: { kind: "master" },
        events: [{ type: "masterAccepted", state: room.getState() }],
        broadcastState: true
      };
    }
    case "pairSlave": {
      const result = room.pairSlave(command);
      if (!result.ok) return rejected(command, result.reason);
      return {
        nextRole: { kind: "slave", pairedSlaveId: result.value.pairedSlaveId },
        events: [
          {
            type: "paired",
            pairedSlaveId: result.value.pairedSlaveId,
            slotNumber: result.value.slotNumber,
            state: room.getState()
          }
        ],
        broadcastState: true
      };
    }
    case "renameSlave":
      return runRoomCommand(command, () => room.renameSlave(command.pairedSlaveId, command.displayName));
    case "addSongToQueue":
      return runRoomCommand(command, () => room.addSongToQueue(command.pairedSlaveId, command.songId));
    case "pinQueuedSongToNext":
      return runRoomCommand(command, () => room.pinQueuedSongToNext(command.pairedSlaveId, command.queueId));
    case "removeQueuedSong":
      return runRoomCommand(command, () => room.removeQueuedSong(command.pairedSlaveId, command.queueId));
    case "skipCurrentSong":
      return runRoomCommand(command, () => room.skipCurrentSong(command.pairedSlaveId));
    case "changeSingingMode":
      return runRoomCommand(command, () => room.changeSingingMode(command.pairedSlaveId, command.singingMode));
    case "setAccompanimentVolume":
      return runRoomCommand(command, () => room.setAccompanimentVolume(command.pairedSlaveId, command.volume));
    case "setVocalVolume":
      return runRoomCommand(command, () => room.setVocalVolume(command.pairedSlaveId, command.volume));
    case "setVocalInputState":
      return runRoomCommand(command, () => room.setVocalInputState(command.pairedSlaveId, command.state));
    case "reportSongEnd":
      return runMasterCommand(role, command, () => room.reportSongEnd(command.queueId));
    case "reportUnplayableSong":
      return runMasterCommand(role, command, () => room.reportUnplayableSong(command.queueId));
  }
}

function runRoomCommand(command: ClientCommand, operation: () => RoomCommandResult): CommandOutcome {
  const result = operation();
  if (!result.ok) return rejected(command, result.reason);
  return { events: [], broadcastState: true };
}

function runMasterCommand(role: ConnectionRole, command: ClientCommand, operation: () => RoomCommandResult): CommandOutcome {
  if (role.kind !== "master") {
    return rejected(command, "只有 Master 可以报告播放状态");
  }

  return runRoomCommand(command, operation);
}

function rejected(command: ClientCommand, reason: string): CommandOutcome {
  return {
    events: [{ type: "commandRejected", command: command.type, reason }],
    broadcastState: false
  };
}
