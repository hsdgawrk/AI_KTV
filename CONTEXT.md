# AI-KTV 项目上下文

## 系统概述

一个本地部署的KTV系统，支持点歌和唱歌功能。

## 核心概念

### 设备角色

- **Server（服务器）**：核心业务逻辑层。负责歌曲库管理、点歌队列、音频混合（伴奏+人声）、WebRTC信令中转、主从设备注册/配对。
- **Master（主机）**：纯展示层。负责播放MV、渲染歌词、显示UI，从Server拉取数据，音频从Master的声卡/扬声器输出。
- **Slave（从机）**：纯输入层。负责麦克风采集、点歌操作界面。

### 架构模式

三层架构：Server为大脑，Master为眼睛，Slave为手+嘴。

- Server和Master可以部署在同一台机器上，也可以分开部署。
- 所有设备（Master、Slave）都连接到Server。
- 一个Server（即一个KTV房间）最多支持2个Slave配对。

### 音频链路

```
Slave 1 麦克风采集 ──┐
                     ├──→ WebRTC传输 → Server接收 → Server混音(人声1+人声2+伴奏) → 推送给Master → Master声卡播放
Slave 2 麦克风采集 ──┘
```

- 支持合唱模式：两个Slave同时唱同一首歌，两路人声混合后与伴奏合并输出。
- 同一时间只播放一首歌，两个Slave共享同一首歌的伴奏。

### 歌曲模式

- **原唱模式**：播放MV原版音频（含原唱），人声叠加上去，跟唱体验。
- **伴奏模式**：使用预分离的伴奏音轨，和人声混合输出，真KTV体验。
- 支持两种模式切换。
- 伴奏音轨由用户使用外部软件预处理分离后上传至Server，系统本身不做分离。

### 歌曲数据组织

```
songs/
└── 歌手-歌名/
    ├── video.mp4          # MV视频
    ├── vocal.wav           # 人声音轨（可选）
    ├── accompaniment.wav   # 伴奏音轨（可选）
    ├── lyrics.lrc          # 歌词文件
    └── meta.json           # 元数据（歌名、歌手、时长等）
```

### 歌曲来源

- 本地文件为主：用户手动放入Server的songs目录，Server扫描自动识别。
- 在线搜索补充：支持在线搜索下载（后续迭代）。

### 歌词来源

- LRC歌词文件为主。
- 在线歌词API补充（后续迭代）。

## 设备连接与配对

- **发现方式**：Slave手动输入Server的IP地址和端口连接。
- **配对方式**：每次配对码。Master启动时生成配对码，Slave输入配对码后连接。
- 后续迭代支持扫码连接（二维码含IP+配对码）。

## 点歌交互

- **搜索**：输入歌名/歌手名搜索，结果列表点选。
- **分类浏览**：按歌手、语种、排行榜分类（后续迭代）。
- **播放队列**：点歌后加入队列末尾，依次播放。
- **置顶功能**：支持置顶，跳过队列直接播放。

## 典型使用场景

- **Server**：电脑（Node.js进程，FFmpeg混音，托管Web页面）
- **Master**：智能电视（浏览器访问Server的URL，显示MV+歌词，播放混合音频）
- **Slave**：手机（浏览器访问Server的URL，点歌+麦克风+歌词显示）

只有Server需要安装，Master和Slave通过浏览器访问即可。

## 技术栈

- **前端/UI**：React（浏览器端，非Electron）
- **实时音频**：WebRTC
- **网络通信**：WebSocket（信令）
- **后端**：Node.js / TypeScript
- **HTTPS**：Server自签证书，启用HTTPS，确保手机浏览器可访问麦克风

## 项目结构

Monorepo，共享类型定义和工具函数：
- `packages/server` — 服务器（Node.js + Express/Fastify，托管Web页面，FFmpeg混音）
- `packages/web-master` — Master端Web页面（React，MV播放+歌词+队列）
- `packages/web-slave` — Slave端Web页面（React，点歌+麦克风+歌词）
- `packages/shared` — 共享代码（类型定义、WebSocket消息格式、WebRTC信令格式）

## 部署与启动

Server为独立Node进程，同时托管Master和Slave的Web页面。

启动顺序：
1. 启动Server（电脑上运行，自动扫描歌曲库，开启HTTPS服务）
2. 电视浏览器访问 `https://<Server IP>:<端口>/master` → 显示配对码
3. 手机浏览器访问 `https://<Server IP>:<端口>/slave` → 输入配对码连接

第一次访问时浏览器会提示证书不受信任，点击"继续访问"即可。

## 数据存储

- 歌曲库：文件系统+JSON，歌曲目录结构即数据库，Server启动时扫描加载到内存。
- 播放队列：内存中维护，Server重启后队列清空，不持久化。

## WebRTC配置

局域网环境，不使用STUN/TURN服务器。ICE候选只收集host类型（本地IP），设备直接互连。

## 音频混合

Server端使用FFmpeg管道进行音频混合：接收多路Slave人声输入+伴奏音轨，混合后输出PCM流推送给Master。Node.js负责管道管理和信令，音频计算交给FFmpeg。

## 通信协议分工

| 数据类型 | 协议 | 用途 |
|----------|------|------|
| 信令 | WebSocket | 配对、点歌、队列管理、状态同步 |
| 音频流 | WebRTC | Slave麦克风→Server、Server→Master混合音频 |
| MV视频 | HTTP流媒体 | Master播放MV视频文件 |
| 查询接口 | HTTP REST API | 歌曲列表、元数据查询 |

## Slave界面

底部Tab切换两个页面：
- **点歌Tab**：搜索歌曲、浏览队列
- **正在唱Tab**：同步显示当前歌曲歌词（与Master同步滚动）

## Master界面

单屏布局，MV视频为主，歌词半透明叠加在视频底部（KTV经典效果）。
- MV播放：HTML5 `<video>` 标签，Electron内核原生支持MP4。
- 歌词渲染：React组件，解析LRC时间戳，监听video `timeupdate`事件同步高亮。
- 点歌队列（侧边栏/弹窗）
- 配对码（弹窗/设置页）
- 设备状态（连接的Slave列表、麦克风状态）
- 伴奏音量控制

## 队列管理

所有Slave和Master都能管理整个队列（点歌、置顶、删除），不做权限区分。

## 播放控制

- 暂停/继续
- 切歌（跳过当前歌曲）
- 原唱/伴奏模式切换
- 后续迭代：重唱、进度拖动

## 音量控制

- **伴奏音量**：Master端控制，全局生效。
- **人声音量**：每个Slave各自控制自己的麦克风音量。

## 容错策略

- **Slave断连**：Server静默该Slave的人声通道，继续播放伴奏，Master提示断开。30秒内重连免配对，超过30秒需重新输入配对码。
- **Master断连**：Server保留队列状态，Master重连后恢复当前播放状态。
- **Server断连**：所有设备提示"服务器已断开"，等待重连。

## MVP范围

### 必须有
- Server：歌曲目录扫描、点歌队列、WebRTC信令、音频混合（FFmpeg）
- Master：MV播放、歌词同步显示、配对码显示、队列显示、伴奏音量控制
- Slave：搜索点歌、麦克风采集、人声音量控制、歌词同步显示
- 设备连接：手动IP+配对码
- 合唱模式（两路人声混合）
- 原唱/伴奏切换

### 后续迭代
- 扫码连接
- 分类浏览
- 在线歌词API
- 重唱、进度拖动
- Web管理后台上传歌曲

## 非功能需求

- 从Slave收声到Master放声必须有极低延迟（目标<100ms）。
- 局域网部署，设备在同一局域网下。
