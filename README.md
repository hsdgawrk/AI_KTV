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
npm run open:master
```

## Seed Assets

当前 **Song Library** 是固定种子数据。为了让 **Master** 在默认 **Accompaniment Mode** 下也能稳定播放，所有种子 **Song** 的 **Original Vocal** 和 **Accompaniment** 暂时都指向同一份本地占位音频：

```text
public/media/audio/summer-night-original.mp3
```

这只表示当前骨架有可播放资产，不表示 **Original Vocal** 和 **Accompaniment** 在领域上是同一个资产。补齐真实歌曲资产后，应为每首 **Song** 分别提供可播放的 **Original Vocal** 和 **Accompaniment**。

## Skeleton Scope

当前骨架实现：

- 一个 **Server** 权威管理 **KTV Room** 状态
- 一个 **Master** 主屏连接
- 最多两个已配对 **Slave**
- **Pairing Code** 配对和 60 秒 **Reconnection Grace Period**
- 固定假数据 **Song Library**
- 添加歌曲、顶歌、切歌、删除自己点的待唱歌曲
- **Singing Mode**、伴奏音量、人声音量、演唱状态的状态控制
- **Master** 真实歌曲音频播放
- **Original Vocal** / **Accompaniment** 切换并保留播放进度；当前种子资产使用同一份占位音频验证流程
- **Timed Lyrics** 与 **Progressive Lyric Highlight**
- 歌曲自然结束后推进到下一首，音频不可播放时自动跳过
- WebSocket 广播完整房间状态快照

当前骨架不实现：

- 真实 MV 播放
- 真实 **Vocal Input** 采集
- 真实 **Mixed Audio**
- 每首歌独立的 **Original Vocal** / **Accompaniment** 资产
- 歌曲资产导入或持久化恢复
