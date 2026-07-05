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
        events: [
          { type: "masterAccepted", state: room.getState() },
          {
            type: "songLibraryRefreshResult",
            summary: room.getLatestSongLibraryRefresh(),
            songLibraryVersion: room.getState().songLibraryVersion
          }
        ],
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
    case "searchSongs":
      return runSongSearchCommand(room, role, command);
    case "addSongToQueue":
      return runRoomCommand(command, () => room.addSongToQueue(command.pairedSlaveId, command.songId));
    case "pinQueuedSongToNext":
      return runRoomCommand(command, () => room.pinQueuedSongToNext(command.pairedSlaveId, command.queueId));
    case "removeQueuedSong":
      return runRoomCommand(command, () => room.removeQueuedSong(command.pairedSlaveId, command.queueId));
    case "skipCurrentSong":
      return runRoomCommand(command, () => room.skipCurrentSong(command.pairedSlaveId));
    case "refreshSongLibrary":
      return runRefreshSongLibraryCommand(room, role, command);
    case "changeSingingMode":
      return runRoomCommand(command, () => room.changeSingingMode(command.pairedSlaveId, command.singingMode));
    case "setAccompanimentVolume":
      return runRoomCommand(command, () => room.setAccompanimentVolume(command.pairedSlaveId, command.volume));
    case "reportSongEnd":
      return runMasterCommand(role, command, () => room.reportSongEnd(command.queueId));
    case "reportUnplayableSong":
      return runMasterCommand(role, command, () => room.reportUnplayableSong(command.queueId));
  }
}

function runSongSearchCommand(
  room: KtvRoom,
  role: ConnectionRole,
  command: Extract<ClientCommand, { type: "searchSongs" }>
): CommandOutcome {
  if (role.kind !== "slave" || role.pairedSlaveId !== command.pairedSlaveId) {
    return rejected(command, "只有对应 Slave 可以搜索曲库");
  }

  const result = room.searchSongs(command.pairedSlaveId, command.query);
  if (!result.ok) return rejected(command, result.reason);
  return {
    events: [
      {
        type: "songSearchResult",
        requestId: command.requestId,
        query: command.query,
        results: result.value.results,
        hasMore: result.value.hasMore,
        songLibraryVersion: result.value.songLibraryVersion
      }
    ],
    broadcastState: false
  };
}

function runRefreshSongLibraryCommand(
  room: KtvRoom,
  role: ConnectionRole,
  command: Extract<ClientCommand, { type: "refreshSongLibrary" }>
): CommandOutcome {
  if (role.kind !== "master") {
    return rejected(command, "只有 Master 可以刷新曲库");
  }

  const previousVersion = room.getState().songLibraryVersion;
  const result = room.refreshSongLibrary();
  if (!result.ok) return rejected(command, result.reason);
  const nextVersion = room.getState().songLibraryVersion;
  return {
    events: [{ type: "songLibraryRefreshResult", summary: result.value, songLibraryVersion: nextVersion }],
    broadcastState: nextVersion !== previousVersion
  };
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
