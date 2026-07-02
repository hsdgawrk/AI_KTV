import fs from "node:fs";
import path from "node:path";
import type {
  Song,
  SongLibraryRefreshIssue,
  SongLibraryRefreshSummary,
  SongSearchResultItem,
  TimedLyricLine
} from "../../shared/protocol";

export type SongLibrarySnapshot = {
  songs: Song[];
  searchEntries: SongSearchEntry[];
  assets: Map<string, string>;
  summary: SongLibraryRefreshSummary;
};

export type SongSearchEntry = {
  song: Song;
  summary: SongSearchResultItem;
  stableSortKey: string;
  normalizedTitle: string;
  normalizedArtist: string;
  normalizedSearchText: string;
};

type RawSongManifest = {
  id?: unknown;
  title?: unknown;
  artist?: unknown;
  language?: unknown;
  sortTitle?: unknown;
  searchText?: unknown;
  originalVocal?: unknown;
  accompaniment?: unknown;
  timedLyrics?: unknown;
  mv?: unknown;
};

const DEFAULT_SONGS_DIR = path.resolve(process.cwd(), "songs");
const SUPPORTED_LANGUAGES = new Set(["zh", "ja", "en", "other"]);

export function configuredSongsDirectory(): string {
  return path.resolve(process.env.AI_KTV_SONGS_DIR ?? DEFAULT_SONGS_DIR);
}

export function loadSongLibraryFromDirectory(songsDir = configuredSongsDirectory()): SongLibrarySnapshot {
  const issues: SongLibraryRefreshIssue[] = [];
  const songs: Song[] = [];
  const searchEntries: SongSearchEntry[] = [];
  const assets = new Map<string, string>();
  const usedIds = new Set<string>();

  if (!fs.existsSync(songsDir)) {
    issues.push(blocking(".", "曲库目录不存在"));
    return snapshot([], [], assets, issues, "failed");
  }

  const stat = fs.statSync(songsDir);
  if (!stat.isDirectory()) {
    issues.push(blocking(".", "曲库路径不是目录"));
    return snapshot([], [], assets, issues, "failed");
  }

  for (const entry of fs.readdirSync(songsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const songDir = path.join(songsDir, entry.name);
    const source = entry.name;
    const manifestPath = path.join(songDir, "song.json");
    if (!fs.existsSync(manifestPath)) {
      issues.push(blocking(source, "缺少 song.json"));
      continue;
    }

    const manifest = readJson<RawSongManifest>(manifestPath);
    if (!manifest.ok) {
      issues.push(blocking(source, "song.json 不是有效 JSON"));
      continue;
    }

    const parsed = parseSongManifest({
      manifest: manifest.value,
      songsDir,
      songDir,
      source,
      usedIds,
      issues,
      assets
    });
    if (!parsed) continue;

    songs.push(parsed.song);
    searchEntries.push(parsed.searchEntry);
  }

  searchEntries.sort(compareSearchEntryStable);
  songs.sort((left, right) => compareSearchEntryStable(entryFor(searchEntries, left), entryFor(searchEntries, right)));
  return snapshot(songs, searchEntries, assets, issues, songs.length > 0 ? "success" : "failed");
}

export function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function parseSongManifest(input: {
  manifest: RawSongManifest;
  songsDir: string;
  songDir: string;
  source: string;
  usedIds: Set<string>;
  issues: SongLibraryRefreshIssue[];
  assets: Map<string, string>;
}): { song: Song; searchEntry: SongSearchEntry } | undefined {
  const { manifest, songDir, source, usedIds, issues, assets } = input;
  const id = requiredString(manifest.id);
  const title = requiredString(manifest.title);
  const artist = requiredString(manifest.artist);
  const originalVocal = requiredString(manifest.originalVocal);
  const accompaniment = requiredString(manifest.accompaniment);

  for (const [label, value] of [
    ["id", id],
    ["title", title],
    ["artist", artist],
    ["originalVocal", originalVocal],
    ["accompaniment", accompaniment]
  ] as const) {
    if (!value) issues.push(blocking(source, `缺少必填字段：${label}`));
  }
  if (!id || !title || !artist || !originalVocal || !accompaniment) return undefined;

  if (usedIds.has(id)) {
    issues.push(blocking(source, `歌曲 id 重复：${id}`));
    return undefined;
  }

  const originalVocalPath = resolveAssetPath(songDir, originalVocal);
  const accompanimentPath = resolveAssetPath(songDir, accompaniment);
  if (!originalVocalPath.ok) issues.push(blocking(source, "原唱文件路径无效"));
  if (!accompanimentPath.ok) issues.push(blocking(source, "伴奏文件路径无效"));
  if (!originalVocalPath.ok || !accompanimentPath.ok) return undefined;

  if (!fileExists(originalVocalPath.value)) {
    issues.push(blocking(source, "原唱文件不存在"));
    return undefined;
  }
  if (!fileExists(accompanimentPath.value)) {
    issues.push(blocking(source, "伴奏文件不存在"));
    return undefined;
  }
  if (originalVocalPath.value === accompanimentPath.value) {
    issues.push(nonBlocking(source, "原唱和伴奏引用同一文件"));
  }

  const lyricsResult = readLyrics({ manifest, songDir, source, issues });
  if (!lyricsResult.ok) return undefined;
  const lyrics = lyricsResult.value;
  const mvPath = optionalAssetPath(songDir, manifest.mv, source, issues, "MV 文件路径无效");

  usedIds.add(id);
  const language = typeof manifest.language === "string" && SUPPORTED_LANGUAGES.has(manifest.language)
    ? (manifest.language as Song["language"])
    : undefined;
  const originalVocalUrl = assetUrl(id, "originalVocal");
  const accompanimentUrl = assetUrl(id, "accompaniment");
  const mvUrl = mvPath?.ok ? assetUrl(id, "mv") : undefined;
  assets.set(assetKey(id, "originalVocal"), originalVocalPath.value);
  assets.set(assetKey(id, "accompaniment"), accompanimentPath.value);
  if (mvPath?.ok) assets.set(assetKey(id, "mv"), mvPath.value);

  const song: Song = {
    id,
    title,
    artist,
    language,
    lyrics,
    originalVocalUrl,
    accompanimentUrl,
    ...(mvUrl ? { mvUrl } : {})
  };
  const sortTitle = typeof manifest.sortTitle === "string" ? manifest.sortTitle : title;
  const searchText = typeof manifest.searchText === "string" ? manifest.searchText : "";
  return {
    song,
    searchEntry: {
      song,
      summary: { id, title, artist, ...(language ? { language } : {}) },
      stableSortKey: normalizeSearchText(`${sortTitle} ${title} ${artist} ${id}`),
      normalizedTitle: normalizeSearchText(title),
      normalizedArtist: normalizeSearchText(artist),
      normalizedSearchText: normalizeSearchText(`${title} ${artist} ${searchText}`)
    }
  };
}

function readLyrics(input: {
  manifest: RawSongManifest;
  songDir: string;
  source: string;
  issues: SongLibraryRefreshIssue[];
}): { ok: true; value: TimedLyricLine[] } | { ok: false } {
  if (input.manifest.timedLyrics === undefined) {
    input.issues.push(nonBlocking(input.source, "缺少歌词文件"));
    return { ok: true, value: [] };
  }

  const lyricsPath = optionalAssetPath(input.songDir, input.manifest.timedLyrics, input.source, input.issues, "歌词文件路径无效");
  if (!lyricsPath?.ok) return { ok: false };
  if (!fileExists(lyricsPath.value)) {
    input.issues.push(blocking(input.source, "歌词文件不存在"));
    return { ok: false };
  }

  const json = readJson<unknown>(lyricsPath.value);
  if (!json.ok || !Array.isArray(json.value)) {
    input.issues.push(blocking(input.source, "歌词文件不是有效 JSON"));
    return { ok: false };
  }

  const lines: TimedLyricLine[] = [];
  for (const [index, rawLine] of json.value.entries()) {
    if (!isRecord(rawLine) || typeof rawLine.startTimeMs !== "number" || typeof rawLine.text !== "string") {
      input.issues.push(blocking(input.source, `歌词第 ${index + 1} 行格式无效`));
      return { ok: false };
    }

    lines.push({
      startTimeMs: rawLine.startTimeMs,
      text: rawLine.text,
      ...(typeof rawLine.romanizedText === "string" ? { romanizedText: rawLine.romanizedText } : {}),
      ...(typeof rawLine.translationText === "string" ? { translationText: rawLine.translationText } : {})
    });
  }

  return { ok: true, value: lines };
}

function optionalAssetPath(
  songDir: string,
  rawPath: unknown,
  source: string,
  issues: SongLibraryRefreshIssue[],
  invalidMessage: string
): { ok: true; value: string } | undefined | { ok: false } {
  if (rawPath === undefined) return undefined;
  const normalized = requiredString(rawPath);
  if (!normalized) {
    issues.push(blocking(source, invalidMessage));
    return { ok: false };
  }

  const resolved = resolveAssetPath(songDir, normalized);
  if (!resolved.ok) {
    issues.push(blocking(source, invalidMessage));
    return { ok: false };
  }
  if (!fileExists(resolved.value)) {
    issues.push(blocking(source, invalidMessage.replace("路径无效", "不存在")));
    return { ok: false };
  }
  return resolved;
}

function resolveAssetPath(songDir: string, relativePath: string): { ok: true; value: string } | { ok: false } {
  if (/^[a-z][a-z0-9+.-]*:/i.test(relativePath) || path.isAbsolute(relativePath)) return { ok: false };
  const resolved = path.resolve(songDir, relativePath);
  const relative = path.relative(songDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return { ok: false };
  return { ok: true, value: resolved };
}

function snapshot(
  songs: Song[],
  searchEntries: SongSearchEntry[],
  assets: Map<string, string>,
  issues: SongLibraryRefreshIssue[],
  status: SongLibraryRefreshSummary["status"]
): SongLibrarySnapshot {
  const blockingIssueCount = issues.filter((issue) => issue.level === "blocking").length;
  const nonBlockingIssueCount = issues.filter((issue) => issue.level === "nonBlocking").length;
  return {
    songs,
    searchEntries,
    assets,
    summary: {
      status,
      songCount: songs.length,
      blockingIssueCount,
      nonBlockingIssueCount,
      issues: issues.slice(0, 5)
    }
  };
}

function compareSearchEntryStable(left: SongSearchEntry, right: SongSearchEntry): number {
  return left.stableSortKey.localeCompare(right.stableSortKey, "zh-Hans") || left.song.id.localeCompare(right.song.id);
}

function entryFor(entries: SongSearchEntry[], song: Song): SongSearchEntry {
  const entry = entries.find((candidate) => candidate.song.id === song.id);
  if (!entry) throw new Error(`Missing search entry for song ${song.id}`);
  return entry;
}

function assetUrl(songId: string, assetName: string): string {
  return `/media/songs/${encodeURIComponent(songId)}/${encodeURIComponent(assetName)}`;
}

export function assetKey(songId: string, assetName: string): string {
  return `${songId}:${assetName}`;
}

function requiredString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function readJson<T>(filePath: string): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(filePath, "utf8")) as T };
  } catch {
    return { ok: false };
  }
}

function blocking(source: string, message: string): SongLibraryRefreshIssue {
  return { level: "blocking", source, message };
}

function nonBlocking(source: string, message: string): SongLibraryRefreshIssue {
  return { level: "nonBlocking", source, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
