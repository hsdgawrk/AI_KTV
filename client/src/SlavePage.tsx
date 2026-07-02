import { useEffect, useMemo, useState } from "react";
import { deviceId } from "./device";
import { useRoomSocket } from "./roomSocket";
import { Panel, QueueList, Shell, SlotList, VolumeControl } from "./ui";

export function SlavePage() {
  const { state, status, error, lastEvent, send, clearError } = useRoomSocket();
  const [pairedSlaveId, setPairedSlaveId] = useState(localStorage.getItem("aiKtvPairedSlaveId") ?? "");
  const [pairingCode, setPairingCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (status === "open" && pairedSlaveId) {
      send({ type: "pairSlave", deviceId, pairingCode: "", displayName: undefined });
    }
  }, [pairedSlaveId, send, status]);

  useEffect(() => {
    if (lastEvent?.type === "paired") {
      setPairedSlaveId(lastEvent.pairedSlaveId);
      localStorage.setItem("aiKtvPairedSlaveId", lastEvent.pairedSlaveId);
      clearError();
    }
  }, [clearError, lastEvent]);

  const mySlot = useMemo(
    () => state?.slaveSlots.find((slot) => slot.pairedSlaveId === pairedSlaveId),
    [pairedSlaveId, state]
  );
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
            <button type="submit">加入</button>
          </form>
        </section>
      </Shell>
    );
  }

  const filteredSongs = state.songLibrary.filter((song) => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;
    return `${song.title} ${song.artist}`.toLowerCase().includes(keyword);
  });

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
        <button className="danger" onClick={() => send({ type: "skipCurrentSong", pairedSlaveId })}>
          切歌
        </button>
      </section>

      <section className="dashboard-grid">
        <Panel title="我的演唱">
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
            onChange={(volume) => send({ type: "setVocalVolume", pairedSlaveId, volume })}
          />
          <button
            className={mySlot.vocalInputState === "singing" ? "active wide-button" : "wide-button"}
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
            onChange={(volume) => send({ type: "setAccompanimentVolume", pairedSlaveId, volume })}
          />
          <SlotList state={state} />
        </Panel>
        <Panel title="点歌" wide>
          <input className="song-search" placeholder="搜索歌名或歌手" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="song-grid">
            {filteredSongs.map((song) => (
              <article className="song-card" key={song.id}>
                <div>
                  <strong>{song.title}</strong>
                  <span>{song.artist}</span>
                </div>
                <button onClick={() => send({ type: "addSongToQueue", pairedSlaveId, songId: song.id })}>点歌</button>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="待唱队列" wide>
          <QueueList state={state} pairedSlaveId={pairedSlaveId} send={send} />
        </Panel>
      </section>
    </Shell>
  );
}
