import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSongLibraryFromDirectory } from "../src/songLibrary";

describe("loadSongLibraryFromDirectory", () => {
  it("loads valid song manifests and reports missing lyrics as non-blocking", () => {
    const root = tempSongsDir();
    const songDir = path.join(root, "summer-night");
    fs.mkdirSync(songDir);
    fs.writeFileSync(path.join(songDir, "original.mp3"), "original");
    fs.writeFileSync(path.join(songDir, "accompaniment.mp3"), "accompaniment");
    fs.writeFileSync(
      path.join(songDir, "song.json"),
      JSON.stringify({
        id: "summer-night",
        title: "夏夜来信",
        artist: "林澈",
        originalVocal: "original.mp3",
        accompaniment: "accompaniment.mp3",
        searchText: "xiaye laixin"
      })
    );

    const snapshot = loadSongLibraryFromDirectory(root);

    expect(snapshot.songs).toHaveLength(1);
    expect(snapshot.songs[0]).toMatchObject({
      id: "summer-night",
      title: "夏夜来信",
      originalVocalUrl: "/media/songs/summer-night/originalVocal",
      accompanimentUrl: "/media/songs/summer-night/accompaniment"
    });
    expect(snapshot.summary.status).toBe("success");
    expect(snapshot.summary.nonBlockingIssueCount).toBe(1);
    expect(snapshot.summary.issues[0]).toMatchObject({ level: "nonBlocking", message: "缺少歌词文件" });
  });

  it("skips manifests that reference assets outside their song directory", () => {
    const root = tempSongsDir();
    fs.writeFileSync(path.join(root, "outside.mp3"), "outside");
    const songDir = path.join(root, "bad-song");
    fs.mkdirSync(songDir);
    fs.writeFileSync(path.join(songDir, "accompaniment.mp3"), "accompaniment");
    fs.writeFileSync(
      path.join(songDir, "song.json"),
      JSON.stringify({
        id: "bad-song",
        title: "坏路径",
        artist: "测试",
        originalVocal: "../outside.mp3",
        accompaniment: "accompaniment.mp3"
      })
    );

    const snapshot = loadSongLibraryFromDirectory(root);

    expect(snapshot.songs).toHaveLength(0);
    expect(snapshot.summary.status).toBe("failed");
    expect(snapshot.summary.blockingIssueCount).toBeGreaterThan(0);
    expect(snapshot.summary.issues[0]).toMatchObject({ level: "blocking", message: "原唱文件路径无效" });
  });
});

function tempSongsDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-ktv-songs-"));
}
