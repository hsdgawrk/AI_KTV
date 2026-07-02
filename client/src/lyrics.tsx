import type { QueuedSong, TimedLyricLine } from "../../shared/protocol";
import { clamp01 } from "./format";

export function LyricStage(props: { currentSong?: QueuedSong; currentTimeMs: number; durationMs: number }) {
  if (!props.currentSong) {
    return (
      <div className="lyric-stage empty">
        <p>等待点歌</p>
      </div>
    );
  }

  const lines = props.currentSong.song.lyrics;
  if (lines.length === 0) {
    return (
      <div className="lyric-stage empty">
        <p>暂无歌词</p>
      </div>
    );
  }

  const activeIndex = activeLyricIndex(lines, props.currentTimeMs);
  const visibleLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ index }) => Math.abs(index - activeIndex) <= 2);

  return (
    <div className="lyric-stage">
      {visibleLines.map(({ line, index }) => (
        <LyricLine
          key={`${line.startTimeMs}-${line.text}`}
          line={line}
          active={index === activeIndex}
          progress={index === activeIndex ? lyricLineProgress(lines, index, props.currentTimeMs, props.durationMs) : 0}
        />
      ))}
    </div>
  );
}

function LyricLine(props: { line: TimedLyricLine; active: boolean; progress: number }) {
  return (
    <div className={props.active ? "lyric-line active" : "lyric-line"}>
      <div className="lyric-text">
        <span>{props.line.text}</span>
        {props.active && (
          <span className="lyric-highlight" style={{ width: `${props.progress * 100}%` }}>
            {props.line.text}
          </span>
        )}
      </div>
      {props.line.romanizedText && <small>{props.line.romanizedText}</small>}
    </div>
  );
}

function activeLyricIndex(lines: TimedLyricLine[], currentTimeMs: number): number {
  let activeIndex = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startTimeMs <= currentTimeMs) activeIndex = index;
  }
  return activeIndex;
}

function lyricLineProgress(lines: TimedLyricLine[], activeIndex: number, currentTimeMs: number, durationMs: number): number {
  const startTimeMs = lines[activeIndex].startTimeMs;
  const nextTimeMs = lines[activeIndex + 1]?.startTimeMs ?? Math.max(durationMs, startTimeMs + 4_000);
  if (nextTimeMs <= startTimeMs) return 1;
  return clamp01((currentTimeMs - startTimeMs) / (nextTimeMs - startTimeMs));
}
