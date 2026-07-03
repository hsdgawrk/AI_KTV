import { useEffect, useRef, useState } from "react";
import type { KtvRoomState, SongLibraryRefreshSummary } from "../../shared/protocol";
import { formatTime, modeLabel } from "./format";
import { LyricStage } from "./lyrics";
import { type MasterPlayback, useMasterPlayback } from "./masterPlayback";
import { useMasterVocalInput } from "./masterVocalInput";
import { useRoomSocket } from "./roomSocket";
import { Panel, PlaybackNotice, PlaybackProgress, PlaybackStatusPanel, QueueList, Shell, SlotList } from "./ui";

export function MasterPage() {
  const { state, status, error, lastEvent, songLibraryRefreshEvent, send } = useRoomSocket();
  const [refreshingSongLibrary, setRefreshingSongLibrary] = useState(false);
  const [songLibraryRefresh, setSongLibraryRefresh] = useState<SongLibraryRefreshSummary>();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playback = useMasterPlayback(state, send, audioRef);
  const vocalInput = useMasterVocalInput({ state, lastEvent, send });
  const isSingingView = Boolean(state?.currentSong);
  const unlockRoomAudio = () => {
    playback.unlockAudio();
    vocalInput.resumeOutput();
  };

  useEffect(() => {
    if (status === "open") send({ type: "registerMaster" });
  }, [send, status]);

  useEffect(() => {
    if (songLibraryRefreshEvent) {
      setRefreshingSongLibrary(false);
      setSongLibraryRefresh(songLibraryRefreshEvent.summary);
    }
  }, [songLibraryRefreshEvent]);

  if (!state) {
    return (
      <Shell title="主屏" status={status} error={error}>
        <audio ref={audioRef} preload="auto" autoPlay playsInline />
      </Shell>
    );
  }

  return (
    <Shell title="主屏" status={status} error={error}>
      <audio ref={audioRef} preload="auto" autoPlay playsInline />
      <section className={isSingingView ? "playback-stage singing" : "playback-stage"}>
        {!isSingingView && (
          <div className="pairing-block">
            <p className="eyebrow">配对码</p>
            <div className="pairing-code">{state.pairingCode}</div>
          </div>
        )}
        <div className="stage-main">
          {isSingingView ? (
            <div className="stage-meta-strip">
              <div className="pairing-chip">
                <span>配对码</span>
                <strong>{state.pairingCode}</strong>
              </div>
              <div className="current-song-chip">
                <span>正在播放</span>
                <strong>{state.currentSong?.song.title}</strong>
                <small>{state.currentSong?.song.artist} · {modeLabel(state.singingMode)}</small>
              </div>
              <div className="room-chip">
                <span>演唱位</span>
                <strong>{compactSlotSummary(state)}</strong>
              </div>
              <div className="room-chip">
                <span>待唱</span>
                <strong>{state.playbackQueue.length} 首</strong>
              </div>
            </div>
          ) : (
            <div className="now-playing standby">
              <p className="eyebrow">正在播放</p>
              <h2>等待点歌</h2>
              <MasterAudioGate playback={playback} onUnlock={unlockRoomAudio} />
            </div>
          )}
          <LyricStage
            currentSong={state.currentSong}
            currentTimeMs={playback.currentTime * 1000}
            durationMs={playback.duration * 1000}
          />
          <PlaybackProgress currentTime={playback.currentTime} duration={playback.duration} />
          <PlaybackNotice playback={playback} />
        </div>
      </section>

      {isSingingView ? (
        <section className="compact-room-strip">
          <span>{playback.message}</span>
          <span>{formatTime(playback.currentTime)} / {formatTime(playback.duration)}</span>
          {playback.status === "blocked" && <button onClick={unlockRoomAudio}>启用声音</button>}
        </section>
      ) : (
        <section className="dashboard-grid">
          <Panel title="演唱位">
            <SlotList state={state} />
          </Panel>
          <Panel title="播放状态">
            <PlaybackStatusPanel playback={playback} onResume={unlockRoomAudio} />
          </Panel>
          <Panel title="曲库">
            <SongLibraryPanel
              state={state}
              refreshing={refreshingSongLibrary}
              summary={songLibraryRefresh}
              onRefresh={() => {
                setRefreshingSongLibrary(true);
                send({ type: "refreshSongLibrary" });
              }}
            />
          </Panel>
          <Panel title="待唱队列" wide>
            <QueueList state={state} />
          </Panel>
        </section>
      )}
    </Shell>
  );
}

function SongLibraryPanel(props: {
  state: KtvRoomState;
  refreshing: boolean;
  summary?: SongLibraryRefreshSummary;
  onRefresh: () => void;
}) {
  return (
    <div className="library-panel">
      <div className="library-summary-row">
        <div>
          <strong>{props.state.songLibraryCount}</strong>
          <span>可点歌曲</span>
        </div>
        <button disabled={props.refreshing} onClick={props.onRefresh}>
          {props.refreshing ? "正在刷新" : "刷新曲库"}
        </button>
      </div>
      {props.summary && (
        <div className={`library-refresh-summary ${props.summary.status}`}>
          <strong>{props.summary.status === "success" ? "刷新完成" : "刷新失败"}</strong>
          <span>
            可用 {props.summary.songCount} 首 · 阻断 {props.summary.blockingIssueCount} · 提醒 {props.summary.nonBlockingIssueCount}
          </span>
          {props.summary.issues.length > 0 && (
            <div className="library-issue-list">
              {props.summary.issues.map((issue, index) => (
                <small key={`${issue.source}-${issue.message}-${index}`}>
                  {issue.level === "blocking" ? "阻断" : "提醒"} · {issue.source} · {issue.message}
                </small>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function compactSlotSummary(state: KtvRoomState): string {
  const connectedSlots = state.slaveSlots.filter((slot) => slot.connectionState === "connected");
  if (connectedSlots.length === 0) return "未连接";

  const singingCount = connectedSlots.filter((slot) => slot.vocalInputState === "singing").length;
  if (singingCount > 0) return `${singingCount} 人演唱`;
  return `${connectedSlots.length} 人已连接`;
}

function MasterAudioGate({ playback, onUnlock }: { playback: MasterPlayback; onUnlock: () => void }) {
  if (playback.audioReady) {
    return <div className="audio-ready-badge">主屏已就绪</div>;
  }

  return (
    <button className="audio-unlock-button" onClick={onUnlock}>
      启用主屏声音
    </button>
  );
}
