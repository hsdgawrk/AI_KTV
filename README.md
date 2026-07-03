# AI-KTV

AI-KTV 是一个面向单个本地 **KTV Room** 的项目骨架。**Server** 管理房间状态，`/master` 是主屏入口，`/slave` 是点歌端入口。

## Development

```bash
npm install
npm run dev
```

默认启动后：

- **Server**: `http://localhost:3000`
- **Master**: `http://localhost:5173/master`
- **Slave**: `http://localhost:5173/slave`

如果 **Slave** 需要在局域网手机或平板上使用麦克风，必须用 HTTPS 访问，因为浏览器只允许 secure context 调用麦克风：

```bash
npm run cert:local
npm run serve:https
```

然后在 Slave 设备上安装并信任 `.cert/ai-ktv-local.cer`，再打开：

`.cert/ai-ktv-local.cer` 是本地 Root CA 证书。手机和平板上只安装还不够，必须在系统设置里启用完全信任：

- iOS/iPadOS: 安装描述文件后，到“设置 > 通用 > 关于本机 > 证书信任设置”启用完全信任。
- Android: 安装为 CA 证书；不同系统入口通常在“安全 > 加密与凭据 > 安装证书 > CA 证书”。
- Windows: 运行 `npm run cert:local:trust` 会把 Root CA 信任到当前用户。

访问地址必须使用证书生成时列出的局域网 IP，例如：

```text
https://<本机局域网IP>:3443/slave
https://<本机局域网IP>:3443/master
```

Windows 本机浏览器也需要信任证书时，可以运行：

```bash
npm run cert:local:trust
```

在电视、Xbox Edge 或普通浏览器上打开 **Master** 后，先在主屏按一次“启用主屏声音”。同一页面会话内，之后 **Slave** 点第一首歌会直接播放。

如果 Windows 桌面调试时希望自动放开浏览器自动播放限制，先保持 `npm run dev` 运行，再用下面的命令打开主屏：

```bash
npm run open:master
```

这个命令会用独立的 Edge/Chrome 主屏窗口打开 **Master**，并允许本地 KTV 主屏自动播放音频。

## Scripts

```bash
npm test
npm run build
npm run cert:local
npm run dev:https
npm run serve:https
npm run open:master
```

## Song Assets

**Song Library** 默认从仓库根目录的 `songs/` 扫描。可以用环境变量 `AI_KTV_SONGS_DIR` 指向外部曲库目录：

```bash
AI_KTV_SONGS_DIR=D:\KTV-Songs npm run dev
```

每首歌一个目录，目录内放 `song.json` 和本地资产文件。`song.json` 使用本地相对路径，不使用 URL：

```json
{
  "id": "song-summer-night",
  "title": "夏夜来信",
  "artist": "林澈",
  "language": "zh",
  "sortTitle": "xia ye lai xin",
  "searchText": "xiaye laixin linche",
  "originalVocal": "original.mp3",
  "accompaniment": "accompaniment.mp3",
  "timedLyrics": "lyrics.json"
}
```

`id`、`title`、`artist`、`originalVocal`、`accompaniment` 必填。`timedLyrics`、`mv`、`language`、`sortTitle`、`searchText` 可选。歌词文件是 JSON timed lyrics 数组，字段对应 `startTimeMs`、`text`、可选 `romanizedText` 和 `translationText`。

## Skeleton Scope

当前骨架实现：

- 一个 **Server** 权威管理 **KTV Room** 状态
- 一个 **Master** 主屏连接
- 最多两个已配对 **Slave**
- **Pairing Code** 配对和 60 秒 **Reconnection Grace Period**
- 固定目录扫描形成 **Song Library**
- **Master** 手动刷新曲库，并显示最近刷新摘要
- **Slave** 通过 Server 端 **Song Search** 点歌，不下载完整曲库
- 添加歌曲、顶歌、切歌、删除自己点的待唱歌曲
- **Singing Mode**、伴奏音量、人声音量、演唱状态的状态控制
- **Master** 真实歌曲音频播放
- **Original Vocal** / **Accompaniment** 切换并保留播放进度
- **Timed Lyrics** 与 **Progressive Lyric Highlight**
- 歌曲自然结束后推进到下一首，音频不可播放时自动跳过
- WebSocket 广播完整房间状态快照

当前骨架不实现：

- 真实 MV 播放
- 歌曲资产上传、管理后台或持久化恢复
