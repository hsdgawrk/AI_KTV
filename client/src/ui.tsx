import type { ClientCommand, KtvRoomState } from "../../shared/protocol";
import type { MasterPlayback } from "./masterPlayback";
import { clamp01, connectionLabel, formatTime, statusLabel, vocalInputAvailabilityLabel } from "./format";

export function Shell(props: { title: string; status: string; error?: string; children?: React.ReactNode }) {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AI-KTV</p>
          <h1>{props.title}</h1>
        </div>
        <div className={`status-pill ${props.status}`}>{statusLabel(props.status)}</div>
      </header>
      {props.error && <div className="error-banner">{props.error}</div>}
      {props.children}
    </main>
  );
}

export function Panel(props: { title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={props.wide ? "panel wide" : "panel"}>
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}

export function SlotList({ state }: { state: KtvRoomState }) {
  return (
    <div className="slot-list">
      {state.slaveSlots.map((slot) => (
        <div className="slot-row" key={slot.slotNumber}>
          <div>
            <strong>{slot.displayLabel}</strong>
            <span>
              {connectionLabel(slot.connectionState)} · {vocalInputAvailabilityLabel(slot.vocalInputAvailability)}
            </span>
          </div>
          <div>
            <span>{slot.vocalInputState === "singing" ? "演唱中" : "未演唱"}</span>
            <span>{slot.vocalVolume}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlaybackNotice({ playback }: { playback: MasterPlayback }) {
  if (playback.status === "playing" || playback.status === "idle") return null;
  return <div className={`playback-notice ${playback.status}`}>{playback.message}</div>;
}

export function PlaybackStatusPanel(props: { playback: MasterPlayback; onResume: () => void }) {
  return (
    <div className="playback-status-panel">
      <div>
        <strong>{props.playback.message}</strong>
        <span>{formatTime(props.playback.currentTime)} / {formatTime(props.playback.duration)}</span>
      </div>
      {props.playback.status === "blocked" && <button onClick={props.onResume}>启用声音</button>}
    </div>
  );
}

export function PlaybackProgress(props: { currentTime: number; duration: number }) {
  const progress = props.duration > 0 ? clamp01(props.currentTime / props.duration) : 0;
  return (
    <div className="playback-progress" aria-label="播放进度">
      <div>
        <span>{formatTime(props.currentTime)}</span>
        <span>{formatTime(props.duration)}</span>
      </div>
      <div className="progress-track">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

export function QueueList(props: {
  state: KtvRoomState;
  pairedSlaveId?: string;
  send?: (command: ClientCommand) => void;
}) {
  if (props.state.playbackQueue.length === 0) return <p className="muted">队列为空</p>;
  return (
    <div className="queue-list">
      {props.state.playbackQueue.map((queuedSong, index) => {
        const canRemove = queuedSong.ownerPairedSlaveId === props.pairedSlaveId;
        return (
          <article className="queue-row" key={queuedSong.queueId}>
            <span>{index + 1}</span>
            <div>
              <strong>{queuedSong.song.title}</strong>
              <small>{queuedSong.song.artist} · {queuedSong.attribution.displayText}</small>
            </div>
            {props.pairedSlaveId && props.send && (
              <div className="queue-actions">
                <button onClick={() => props.send?.({ type: "pinQueuedSongToNext", pairedSlaveId: props.pairedSlaveId!, queueId: queuedSong.queueId })}>
                  顶歌
                </button>
                {canRemove && (
                  <button className="ghost-danger" onClick={() => props.send?.({ type: "removeQueuedSong", pairedSlaveId: props.pairedSlaveId!, queueId: queuedSong.queueId })}>
                    删除
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function VolumeControl(props: { label: string; value: number; onChange: (volume: number) => void }) {
  return (
    <label>
      {props.label}
      <input type="range" min={0} max={100} value={props.value} onChange={(event) => props.onChange(Number(event.target.value))} />
    </label>
  );
}
