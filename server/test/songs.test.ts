import { describe, expect, it } from "vitest";
import { assetKey, loadSongLibraryFromDirectory } from "../src/songLibrary";

describe("song asset directory", () => {
  it("only exposes scanned songs with local assets that exist", () => {
    const library = loadSongLibraryFromDirectory();

    for (const song of library.songs) {
      expect(localSongAssetExists(song.originalVocalUrl, library.assets), `${song.id} original vocal`).toBe(true);
      expect(localSongAssetExists(song.accompanimentUrl, library.assets), `${song.id} accompaniment`).toBe(true);
    }
  });
});

function localSongAssetExists(assetUrl: string, localAssets: Map<string, string>): boolean {
  const match = /^\/media\/songs\/([^/]+)\/([^/]+)$/.exec(assetUrl);
  if (!match) return false;

  const [, songId, assetName] = match;
  return localAssets.has(assetKey(songId, assetName));
}
