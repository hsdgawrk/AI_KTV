import type { SingingMode, VocalInputAvailability } from "../../shared/protocol";

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function modeLabel(mode: SingingMode): string {
  return mode === "originalVocal" ? "原唱" : "伴奏";
}

export function statusLabel(status: string): string {
  if (status === "open") return "已连接";
  if (status === "closed") return "已断开";
  return "连接中";
}

export function connectionLabel(state: string): string {
  if (state === "connected") return "已连接";
  if (state === "disconnected") return "已断开";
  return "空位";
}

export function vocalInputAvailabilityLabel(availability: VocalInputAvailability): string {
  if (availability === "available") return "可演唱";
  if (availability === "interrupted") return "人声中断";
  return "未可用";
}
