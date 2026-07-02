import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { seededSongLibrary } from "../src/songs";

describe("seededSongLibrary", () => {
  it("only references local audio assets that exist", () => {
    for (const song of seededSongLibrary) {
      expect(localPublicAssetExists(song.originalVocalUrl), `${song.id} original vocal`).toBe(true);
      expect(localPublicAssetExists(song.accompanimentUrl), `${song.id} accompaniment`).toBe(true);
    }
  });
});

function localPublicAssetExists(assetUrl: string): boolean {
  if (!assetUrl.startsWith("/")) return false;
  const relativePath = assetUrl.slice(1).split("/");
  return existsSync(path.resolve(process.cwd(), "public", ...relativePath));
}
