import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientCommand, SongSearchResultItem } from "../../shared/protocol";
import { deviceId } from "./device";
import { vocalInputAvailabilityLabel } from "./format";
import { useRoomSocket } from "./roomSocket";
import { useSlaveVocalInput } from "./slaveVocalInput";
import { Panel, QueueList, Shell, SlotList, VolumeControl } from "./ui";

export function SlavePage() {
  const { state, status, error, lastEvent, pairedEvent, send, clearError } = useRoomSocket();
  const [pairedSlaveId, setPairedSlaveId] = useState(localStorage.getItem("aiKtvPairedSlaveId") ?? "");
  const [pairingCode, setPairingCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [search, setSearch] = useState("");
  const [songResults, setSongResults] = useState<SongSearchResultItem[]>([]);
  const [songResultsHasMore, setSongResultsHasMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [pendingSongIds, setPendingSongIds] = useState<Set<string>>(() => new Set());
  const [skipArmed, setSkipArmed] = useState(false);
  const searchRequestSequence = useRef(0);
  const latestSearchRequestId = useRef("");
  const sendThrottledVolume = useThrottledVolumeCommand(send);
  const vocalInput = useSlaveVocalInput({ state, pairedSlaveId, lastEvent, send });

  useEffect(() => {
    if (status === "open" && pairedSlaveId) {
      send({ type: "pairSlave", deviceId, pairingCode: "", displayName: undefined });
    }
  }, [pairedSlaveId, send, status]);

  useEffect(() => {
    if (pairedEvent) {
      setPairedSlaveId(pairedEvent.pairedSlaveId);
      localStorage.setItem("aiKtvPairedSlaveId", pairedEvent.pairedSlaveId);
      clearError();
    }
  }, [clearError, pairedEvent]);

  useEffect(() => {
    if (lastEvent?.type !== "songSearchResult") return;
    if (lastEvent.requestId !== latestSearchRequestId.current) return;
    setSongResults(lastEvent.results);
    setSongResultsHasMore(lastEvent.hasMore);
    setSearching(false);
  }, [lastEvent]);

  const mySlot = useMemo(
    () => state?.slaveSlots.find((slot) => slot.pairedSlaveId === pairedSlaveId),
    [pairedSlaveId, state]
  );

  useEffect(() => {
    if (!state || !mySlot || mySlot.connectionState !== "connected") return;
    const timeoutId = window.setTimeout(() => {
      const requestId = `song-search-${++searchRequestSequence.current}`;
      latestSearchRequestId.current = requestId;
      setSearching(true);
      send({ type: "searchSongs", pairedSlaveId, requestId, query: search });
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [mySlot, pairedSlaveId, search, send, state?.songLibraryVersion]);

  useEffect(() => {
    setPendingSongIds(new Set());
  }, [state?.playbackQueue, state?.currentSong, lastEvent]);

  if (!state || !mySlot || mySlot.connectionState !== "connected") {
    return (
      <Shell title="点歌端" status={status} error={error}>
        <section className="pair-card">
          <p className="eyebrow">加入房间</p>
          <h2>输入配对码</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send({ type: "pairSlave", deviceId, pairingCode, displayName });
            }}
          >
            <label>
              配对码
              <input
                value={pairingCode}
                onChange={(event) => setPairingCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                maxLength={4}
              />
            </label>
            <label>
              昵称（可选）
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={16} />
            </label>
            <button type="submit" disabled={status !== "open" || pairingCode.length !== 4}>
              加入
            </button>
          </form>
        </section>
      </Shell>
    );
  }

  const queueCountBySongId = new Map<string, number>();
  for (const queuedSong of state.playbackQueue) {
    queueCountBySongId.set(queuedSong.song.id, (queueCountBySongId.get(queuedSong.song.id) ?? 0) + 1);
  }
  const vocalInputAvailable = mySlot.vocalInputAvailability === "available";
  const skipCurrentSong = () => {
    if (!state.currentSong) return;
    if (!skipArmed) {
      setSkipArmed(true);
      window.setTimeout(() => setSkipArmed(false), 3_000);
      return;
    }

    setSkipArmed(false);
    send({ type: "skipCurrentSong", pairedSlaveId });
  };

  return (
    <Shell title="点歌端" status={status} error={error}>
      <section className="slave-toolbar">
        <div>
          <p className="eyebrow">{mySlot.displayLabel}</p>
          <h2>{state.currentSong ? state.currentSong.song.title : "等待点歌"}</h2>
        </div>
        <div className="segmented">
          <button
            className={state.singingMode === "originalVocal" ? "active" : ""}
            onClick={() => send({ type: "changeSingingMode", pairedSlaveId, singingMode: "originalVocal" })}
          >
            原唱
          </button>
          <button
            className={state.singingMode === "accompaniment" ? "active" : ""}
            onClick={() => send({ type: "changeSingingMode", pairedSlaveId, singingMode: "accompaniment" })}
          >
            伴奏
          </button>
        </div>
        <button className="danger" disabled={!state.currentSong} onClick={skipCurrentSong}>
          {skipArmed ? "确认切歌" : "切歌"}
        </button>
      </section>

      <section className="dashboard-grid">
        <Panel title="我的演唱">
          <div className={`vocal-input-status ${mySlot.vocalInputAvailability}`}>
            <span>麦克风</span>
            <strong>{vocalInputAvailabilityLabel(mySlot.vocalInputAvailability)}</strong>
            <small>{vocalInput.message}</small>
          </div>
          <label>
            昵称
            <input
              defaultValue={mySlot.displayName ?? ""}
              maxLength={16}
              onBlur={(event) => send({ type: "renameSlave", pairedSlaveId, displayName: event.target.value })}
            />
          </label>
          <VolumeControl
            label="人声音量"
            value={mySlot.vocalVolume}
            onChange={(volume) => sendThrottledVolume({ type: "setVocalVolume", pairedSlaveId, volume })}
          />
          <button
            className={mySlot.vocalInputState === "singing" ? "active wide-button" : "wide-button"}
            disabled={!vocalInputAvailable}
            onClick={() =>
              send({
                type: "setVocalInputState",
                pairedSlaveId,
                state: mySlot.vocalInputState === "singing" ? "idle" : "singing"
              })
            }
          >
            {mySlot.vocalInputState === "singing" ? "停止演唱" : "开始演唱"}
          </button>
        </Panel>
        <Panel title="房间控制">
          <VolumeControl
            label="伴奏音量"
            value={state.accompanimentVolume}
            onChange={(volume) => sendThrottledVolume({ type: "setAccompanimentVolume", pairedSlaveId, volume })}
          />
          <SlotList state={state} />
        </Panel>
        <Panel title="点歌" wide>
          <input className="song-search" placeholder="搜索歌名或歌手" value={search} onChange={(event) => setSearch(event.target.value)} />
          {searching && <p className="muted song-search-status">搜索中...</p>}
          <div className="song-grid">
            {songResults.map((song) => {
              const queueCount = queueCountBySongId.get(song.id) ?? 0;
              const pending = pendingSongIds.has(song.id);
              return (
              <article className="song-card" key={song.id}>
                <div>
                  <strong>{song.title}</strong>
                  <span>
                    {song.artist}
                    {queueCount > 0 ? ` · 队列中 ${queueCount} 次` : ""}
                  </span>
                </div>
                <button
                  disabled={pending}
                  onClick={() => {
                    setPendingSongIds((previous) => new Set(previous).add(song.id));
                    send({ type: "addSongToQueue", pairedSlaveId, songId: song.id });
                  }}
                >
                  {pending ? "点歌中" : "点歌"}
                </button>
              </article>
              );
            })}
          </div>
          {!searching && state.songLibraryCount === 0 && <p className="muted song-empty-state">暂无可点歌曲</p>}
          {!searching && state.songLibraryCount > 0 && songResults.length === 0 && (
            <p className="muted song-empty-state">没有匹配歌曲</p>
          )}
          {songResultsHasMore && <p className="muted song-empty-state">还有更多结果，请继续输入缩小范围</p>}
        </Panel>
        <Panel title="待唱队列" wide>
          <QueueList state={state} pairedSlaveId={pairedSlaveId} send={send} />
        </Panel>
      </section>
    </Shell>
  );
}

function useThrottledVolumeCommand(send: (command: ClientCommand) => void) {
  const lastSentAt = useRef(0);
  const trailingCommand = useRef<ClientCommand | undefined>(undefined);
  const trailingTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (trailingTimer.current) window.clearTimeout(trailingTimer.current);
    };
  }, []);

  return (command: Extract<ClientCommand, { type: "setVocalVolume" | "setAccompanimentVolume" }>) => {
    const now = Date.now();
    const elapsed = now - lastSentAt.current;
    if (elapsed >= 120) {
      lastSentAt.current = now;
      send(command);
      return;
    }

    trailingCommand.current = command;
    if (trailingTimer.current) window.clearTimeout(trailingTimer.current);
    trailingTimer.current = window.setTimeout(() => {
      if (!trailingCommand.current) return;
      lastSentAt.current = Date.now();
      send(trailingCommand.current);
      trailingCommand.current = undefined;
    }, 120 - elapsed);
  };
}
