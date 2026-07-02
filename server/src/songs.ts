import type { Song } from "../../shared/protocol";

const seededAudioUrl = "/media/audio/summer-night-original.mp3";

export const seededSongLibrary: Song[] = [
  {
    id: "song-summer-night",
    title: "夏夜来信",
    artist: "林澈",
    language: "zh",
    mvUrl: "/media/mv/summer-night.mp4",
    lyrics: [
      { startTimeMs: 0, text: "街灯把晚风拉长" },
      { startTimeMs: 8_000, text: "你在副歌里回望" },
      { startTimeMs: 16_000, text: "这一句唱给月亮" }
    ],
    originalVocalUrl: seededAudioUrl,
    accompanimentUrl: seededAudioUrl
  },
  {
    id: "song-neon-harbor",
    title: "霓虹港口",
    artist: "北岸乐队",
    language: "zh",
    mvUrl: "/media/mv/neon-harbor.mp4",
    lyrics: [
      { startTimeMs: 0, text: "霓虹落在水面" },
      { startTimeMs: 7_000, text: "人群散成光点" },
      { startTimeMs: 14_000, text: "下一拍就靠岸" }
    ],
    originalVocalUrl: seededAudioUrl,
    accompanimentUrl: seededAudioUrl
  },
  {
    id: "song-after-rain",
    title: "雨后排练室",
    artist: "周予安",
    language: "zh",
    mvUrl: "/media/mv/after-rain.mp4",
    lyrics: [
      { startTimeMs: 0, text: "窗外还剩一点雨" },
      { startTimeMs: 7_500, text: "鼓点敲开旧旋律" },
      { startTimeMs: 15_000, text: "我把回忆唱下去" }
    ],
    originalVocalUrl: seededAudioUrl,
    accompanimentUrl: seededAudioUrl
  },
  {
    id: "song-moon-road",
    title: "月台慢车",
    artist: "许未",
    language: "zh",
    mvUrl: "/media/mv/moon-road.mp4",
    lyrics: [
      { startTimeMs: 0, text: "慢车穿过月台" },
      { startTimeMs: 8_000, text: "把告别留给站牌" },
      { startTimeMs: 16_000, text: "下一站有人等待" }
    ],
    originalVocalUrl: seededAudioUrl,
    accompanimentUrl: seededAudioUrl
  }
];
