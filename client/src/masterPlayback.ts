import { useEffect, useRef, useState } from "react";
import type { ClientCommand, KtvRoomState, QueuedSong, SingingMode } from "../../shared/protocol";

export type PlaybackStatus = "idle" | "loading" | "switching" | "playing" | "blocked" | "failed";

export type MasterPlayback = {
  status: PlaybackStatus;
  message: string;
  currentTime: number;
  duration: number;
  audioReady: boolean;
  unlockAudio: () => void;
  resume: () => void;
};

export function useMasterPlayback(
  state: KtvRoomState | undefined,
  send: (command: ClientCommand) => void,
  audioRef: React.RefObject<HTMLAudioElement | null>
): MasterPlayback {
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [message, setMessage] = useState("等待点歌");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const audioReadyRef = useRef(false);
  const currentSongRef = useRef<QueuedSong | undefined>(undefined);
  const loadedQueueIdRef = useRef<string | undefined>(undefined);
  const reportedUnplayableQueueIdRef = useRef<string | undefined>(undefined);
  const switchTimeoutRef = useRef<number | undefined>(undefined);
  const loadTimeoutRef = useRef<number | undefined>(undefined);
  const playbackFrameRef = useRef<number | undefined>(undefined);
  const playbackTimerRef = useRef<number | undefined>(undefined);
  const lastPlaybackSyncRef = useRef(0);

  useEffect(() => {
    currentSongRef.current = state?.currentSong;
  }, [state?.currentSong]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, (state?.accompanimentVolume ?? 70) / 100));
  }, [audioRef, state?.accompanimentVolume]);

  const markAudioReady = (ready: boolean) => {
    audioReadyRef.current = ready;
    setAudioReady(ready);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime || 0);
      setDuration(readMediaDuration(audio));
    };
    const stopPlaybackClock = () => {
      if (playbackFrameRef.current === undefined) return;
      window.cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = undefined;
    };
    const stopPlaybackTimer = () => {
      if (playbackTimerRef.current === undefined) return;
      window.clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = undefined;
    };
    const startPlaybackClock = () => {
      if (playbackFrameRef.current !== undefined) return;
      lastPlaybackSyncRef.current = 0;
      playbackFrameRef.current = window.requestAnimationFrame(tickPlaybackClock);
    };
    const tickPlaybackClock = (timestamp: number) => {
      if (timestamp - lastPlaybackSyncRef.current >= 100) {
        lastPlaybackSyncRef.current = timestamp;
        updateTime();
      }

      if (audio.paused || audio.ended) {
        playbackFrameRef.current = undefined;
        updateTime();
        return;
      }

      playbackFrameRef.current = window.requestAnimationFrame(tickPlaybackClock);
    };
    const handlePlaybackStarted = () => {
      updateTime();
      startPlaybackClock();
    };
    const handlePlaybackStopped = () => {
      updateTime();
      stopPlaybackClock();
      stopPlaybackTimer();
    };
    const handleEnded = () => {
      handlePlaybackStopped();
      const queueId = loadedQueueIdRef.current;
      if (queueId) send({ type: "reportSongEnd", queueId });
    };
    const handleError = () => {
      const queueId = loadedQueueIdRef.current;
      if (queueId) reportUnplayable(queueId);
    };

    const reportUnplayable = (queueId: string) => {
      if (reportedUnplayableQueueIdRef.current === queueId) return;
      reportedUnplayableQueueIdRef.current = queueId;
      window.clearTimeout(switchTimeoutRef.current);
      stopPlaybackTimer();
      setStatus("failed");
      setMessage("这首歌暂时无法播放，正在切到下一首");
      console.warn("AI-KTV audio failed", {
        queueId,
        currentSong: currentSongRef.current?.song.title,
        source: audio.currentSrc,
        error: audio.error
      });
      send({ type: "reportUnplayableSong", queueId });
    };

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("durationchange", updateTime);
    audio.addEventListener("loadedmetadata", updateTime);
    audio.addEventListener("play", handlePlaybackStarted);
    audio.addEventListener("playing", handlePlaybackStarted);
    audio.addEventListener("pause", handlePlaybackStopped);
    audio.addEventListener("seeking", updateTime);
    audio.addEventListener("seeked", updateTime);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("durationchange", updateTime);
      audio.removeEventListener("loadedmetadata", updateTime);
      audio.removeEventListener("play", handlePlaybackStarted);
      audio.removeEventListener("playing", handlePlaybackStarted);
      audio.removeEventListener("pause", handlePlaybackStopped);
      audio.removeEventListener("seeking", updateTime);
      audio.removeEventListener("seeked", updateTime);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      stopPlaybackClock();
      stopPlaybackTimer();
      window.clearTimeout(switchTimeoutRef.current);
      window.clearTimeout(loadTimeoutRef.current);
    };
  }, [audioRef, send]);

  useEffect(() => {
    const audio = audioRef.current;
    const currentSong = state?.currentSong;
    window.clearTimeout(switchTimeoutRef.current);
    window.clearTimeout(loadTimeoutRef.current);

    const syncPlaybackTime = () => {
      if (!audio) return;
      setCurrentTime(audio.currentTime || 0);
      setDuration(readMediaDuration(audio));
    };
    const stopPlaybackTimer = () => {
      if (playbackTimerRef.current === undefined) return;
      window.clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = undefined;
    };
    const startPlaybackTimer = () => {
      stopPlaybackTimer();
      syncPlaybackTime();
      playbackTimerRef.current = window.setInterval(syncPlaybackTime, 100);
    };

    if (!audio) return;
    if (!currentSong) {
      stopPlaybackTimer();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      loadedQueueIdRef.current = undefined;
      reportedUnplayableQueueIdRef.current = undefined;
      setStatus("idle");
      setMessage(audioReadyRef.current ? "主屏已就绪" : "等待点歌");
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const sameQueuedSong = loadedQueueIdRef.current === currentSong.queueId;
    const preservedTime = sameQueuedSong ? audio.currentTime : 0;
    const source = audioSourceFor(currentSong, state?.singingMode ?? "accompaniment");
    let cancelled = false;

    loadedQueueIdRef.current = currentSong.queueId;
    if (!sameQueuedSong) reportedUnplayableQueueIdRef.current = undefined;
    setStatus(sameQueuedSong ? "switching" : "loading");
    setMessage(sameQueuedSong ? "正在切换音源" : "正在加载歌曲");

    let attemptedPlay = false;
    const playLoadedAudio = () => {
      if (cancelled || attemptedPlay) return;
      attemptedPlay = true;
      window.clearTimeout(loadTimeoutRef.current);
      if (preservedTime > 0 && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(preservedTime, Math.max(0, audio.duration - 0.05));
      }

      playAudioWithAutoplayFallback(audio)
        .then(() => {
          if (cancelled) return;
          window.clearTimeout(switchTimeoutRef.current);
          startPlaybackTimer();
          markAudioReady(true);
          setStatus("playing");
          setMessage("播放中");
        })
        .catch((playError: unknown) => {
          if (cancelled) return;
          window.clearTimeout(switchTimeoutRef.current);
          if (playError instanceof DOMException && playError.name === "NotAllowedError") {
            markAudioReady(false);
            setStatus("blocked");
            setMessage("启用主屏声音");
            return;
          }

          console.warn("AI-KTV audio play rejected", {
            queueId: currentSong.queueId,
            source,
            error: playError
          });
          if (reportedUnplayableQueueIdRef.current !== currentSong.queueId) {
            reportedUnplayableQueueIdRef.current = currentSong.queueId;
            setStatus("failed");
            setMessage("这首歌暂时无法播放，正在切到下一首");
            send({ type: "reportUnplayableSong", queueId: currentSong.queueId });
          }
        });
    };

    audio.pause();
    audio.addEventListener("loadedmetadata", playLoadedAudio);
    audio.addEventListener("canplay", playLoadedAudio);
    audio.src = source;
    audio.load();
    if (audio.readyState >= 1) playLoadedAudio();
    loadTimeoutRef.current = window.setTimeout(() => {
      if (cancelled || reportedUnplayableQueueIdRef.current === currentSong.queueId) return;
      reportedUnplayableQueueIdRef.current = currentSong.queueId;
      setStatus("failed");
      setMessage("歌曲加载超时，正在切到下一首");
      send({ type: "reportUnplayableSong", queueId: currentSong.queueId });
    }, 5_000);

    if (sameQueuedSong) {
      switchTimeoutRef.current = window.setTimeout(() => {
        if (cancelled || reportedUnplayableQueueIdRef.current === currentSong.queueId) return;
        reportedUnplayableQueueIdRef.current = currentSong.queueId;
        setStatus("failed");
        setMessage("切换音源超时，正在切到下一首");
        send({ type: "reportUnplayableSong", queueId: currentSong.queueId });
      }, 2_000);
    }

    return () => {
      cancelled = true;
      stopPlaybackTimer();
      audio.removeEventListener("loadedmetadata", playLoadedAudio);
      audio.removeEventListener("canplay", playLoadedAudio);
      window.clearTimeout(switchTimeoutRef.current);
      window.clearTimeout(loadTimeoutRef.current);
    };
  }, [audioRef, send, state?.currentSong?.queueId, state?.singingMode]);

  const resume = () => {
    const audio = audioRef.current;
    if (!audio) return;
    playAudioWithAutoplayFallback(audio)
      .then(() => {
        if (playbackTimerRef.current !== undefined) window.clearInterval(playbackTimerRef.current);
        setCurrentTime(audio.currentTime || 0);
        setDuration(readMediaDuration(audio));
        playbackTimerRef.current = window.setInterval(() => {
          setCurrentTime(audio.currentTime || 0);
          setDuration(readMediaDuration(audio));
        }, 100);
        markAudioReady(true);
        setStatus("playing");
        setMessage("播放中");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          markAudioReady(false);
          setStatus("blocked");
          setMessage("启用主屏声音");
        }
        console.warn("AI-KTV audio resume rejected", error);
      });
  };

  const unlockAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentSongRef.current) {
      resume();
      return;
    }

    primeAudioOutput(audio)
      .then(() => {
        markAudioReady(true);
        setStatus("idle");
        setMessage("主屏已就绪");
      })
      .catch((error: unknown) => {
        markAudioReady(false);
        setStatus("blocked");
        setMessage("启用主屏声音");
        console.warn("AI-KTV audio unlock rejected", error);
      });
  };

  return { status, message, currentTime, duration, audioReady, unlockAudio, resume };
}

async function playAudioWithAutoplayFallback(audio: HTMLAudioElement): Promise<void> {
  audio.muted = false;
  try {
    await audio.play();
    return;
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "NotAllowedError") throw error;
  }

  audio.muted = true;
  await audio.play();
  window.setTimeout(() => {
    audio.muted = false;
  }, 50);
}

const SILENT_AUDIO_DATA_URI = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

async function primeAudioOutput(audio: HTMLAudioElement): Promise<void> {
  await Promise.allSettled([primeHtmlAudioElement(audio), primeWebAudioOutput()]);
}

async function primeHtmlAudioElement(audio: HTMLAudioElement): Promise<void> {
  const previousMuted = audio.muted;
  const previousSrc = audio.getAttribute("src");
  if (previousSrc) return;

  audio.muted = true;
  audio.src = SILENT_AUDIO_DATA_URI;
  try {
    await audio.play();
  } finally {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    audio.muted = previousMuted;
  }
}

async function primeWebAudioOutput(): Promise<void> {
  const AudioContextConstructor =
    window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;

  const context = new AudioContextConstructor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  gain.gain.value = 0;
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.03);

  if (context.state === "suspended") {
    await context.resume();
  }

  await new Promise<void>((resolve) => window.setTimeout(resolve, 60));
  await context.close();
}

function audioSourceFor(queuedSong: QueuedSong, singingMode: SingingMode): string {
  return singingMode === "originalVocal" ? queuedSong.song.originalVocalUrl : queuedSong.song.accompanimentUrl;
}

function readMediaDuration(media: HTMLMediaElement): number {
  if (Number.isFinite(media.duration) && media.duration > 0) return media.duration;
  if (media.seekable.length > 0) {
    const seekableEnd = media.seekable.end(media.seekable.length - 1);
    if (Number.isFinite(seekableEnd) && seekableEnd > 0) return seekableEnd;
  }

  return 0;
}
