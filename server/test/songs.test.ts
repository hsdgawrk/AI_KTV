import { describe, expect, it } from "vitest";
import { assetKey, loadSongLibraryFromDirectory } from "../src/songLibrary";
import { seededSongLibrary } from "../src/songs";

describe("seededSongLibrary", () => {
  it("only references local song assets that exist", () => {
    const localAssets = loadSongLibraryFromDirectory().assets;

    for (const song of seededSongLibrary) {
      expect(localSongAssetExists(song.originalVocalUrl, localAssets), `${song.id} original vocal`).toBe(true);
      expect(localSongAssetExists(song.accompanimentUrl, localAssets), `${song.id} accompaniment`).toBe(true);
    }
  });
});

function localSongAssetExists(assetUrl: string, localAssets: Map<string, string>): boolean {
  const match = /^\/media\/songs\/([^/]+)\/([^/]+)$/.exec(assetUrl);
  if (!match) return false;

  const [, songId, assetName] = match;
  return localAssets.has(assetKey(songId, assetName));
}
