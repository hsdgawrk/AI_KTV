# AI-KTV

AI-KTV 是一个面向单个本地 KTV 房间的点歌、播放和演唱上下文。它描述房间内的设备角色、歌曲资产、播放队列、演唱模式和演唱者输入之间的关系。

## Language

### Room and Devices

**KTV Room**:
一次独立的本地 KTV 使用场景，由一个 **Server** 管理，并包含零个或一个 **Master** 以及最多两个已配对的 **Slave**。
_Avoid_: session, deployment, environment

**Server**:
KTV Room 的协调者，拥有歌曲库、播放队列、设备配对状态和当前播放状态。
_Avoid_: backend, host machine, computer

**Master**:
KTV Room 的主显示和放声角色，面向观众展示 MV、歌词、播放状态和队列。
_Avoid_: TV, player, display client

**Slave**:
KTV Room 的点歌和演唱输入角色，由演唱者使用；一个 KTV Room 最多同时有两个已配对的 Slave。
_Avoid_: phone, remote, microphone client

**Device**:
连接到 **Server** 的房间角色实例；在本上下文中通常指 **Master** 或 **Slave**，不指运行 Server 的物理机器。
_Avoid_: client, endpoint

**Pairing Code**:
允许 **Slave** 加入当前 **KTV Room** 的一次性口令。
_Avoid_: password, token, auth code

**Pairing**:
**Slave** 使用 **Pairing Code** 成为当前 **KTV Room** 中已连接输入角色的过程。
_Avoid_: login, registration, binding

### Songs and Lyrics

**Song**:
可被点播和演唱的曲目，属于 **Song Library**，并可关联 MV、歌词、原唱音频和伴奏音频。
_Avoid_: media item, file, track

**Song Library**:
当前 **KTV Room** 可点播的 **Song** 集合。
_Avoid_: database, folder, catalog

**MV**:
与 **Song** 关联的音乐视频，由 **Master** 在演唱时展示。
_Avoid_: video file, clip

**Lyrics**:
与 **Song** 关联的逐行歌词文本，可与当前播放进度同步展示。
_Avoid_: LRC, subtitle

**Original Vocal**:
**Song** 的含原唱音频版本，用于跟唱。
_Avoid_: vocal track, full mix

**Accompaniment**:
**Song** 的无原唱伴奏版本，用于正式演唱。
_Avoid_: backing track, instrumental file

### Queue and Playback

**Playback Queue**:
等待播放的 **Song** 有序列表；所有已连接的 **Master** 和 **Slave** 看到并管理同一个队列。
_Avoid_: playlist, order list

**Queued Song**:
已经加入 **Playback Queue** 但尚未成为 **Current Song** 的 **Song**。
_Avoid_: request, order

**Current Song**:
当前正在 **KTV Room** 中播放和演唱的唯一 **Song**。
_Avoid_: active track, now playing item

**Pin to Next**:
将一个 **Queued Song** 提升为下一个播放目标的队列操作。
_Avoid_: top, priority play, jump queue

**Skip**:
结束 **Current Song** 并切换到下一个可播放 **Queued Song** 的播放操作。
_Avoid_: cut song, next

### Singing and Audio

**Singing Mode**:
**Current Song** 的演唱音频来源选择；当前只包含 **Original Vocal Mode** 和 **Accompaniment Mode**。
_Avoid_: mode, audio mode

**Original Vocal Mode**:
使用 **Original Vocal** 作为 **Current Song** 的基础音频，演唱者的人声叠加其上。
_Avoid_: original mode, guide vocal

**Accompaniment Mode**:
使用 **Accompaniment** 作为 **Current Song** 的基础音频，演唱者的人声叠加其上。
_Avoid_: karaoke mode, instrumental mode

**Chorus Mode**:
两个已配对 **Slave** 同时为同一个 **Current Song** 提供演唱输入的状态。
_Avoid_: duet, two-mic mode

**Vocal Input**:
来自一个 **Slave** 的演唱者人声。
_Avoid_: microphone stream, voice data

**Mixed Audio**:
**Current Song** 的基础音频与一个或两个 **Vocal Input** 合成后的房间输出音频。
_Avoid_: output stream, final audio

**Accompaniment Volume**:
影响整个 **KTV Room** 中 **Current Song** 基础音频响度的音量设置。
_Avoid_: music volume, master volume

**Vocal Volume**:
影响单个 **Slave** 的 **Vocal Input** 响度的音量设置。
_Avoid_: mic gain, microphone volume

### Connection States

**Disconnected Slave**:
曾经配对但当前失去连接的 **Slave**；它的 **Vocal Input** 不再参与 **Mixed Audio**。
_Avoid_: offline phone, muted mic

**Reconnection Grace Period**:
**Disconnected Slave** 可回到原 **KTV Room** 且不重新输入 **Pairing Code** 的短暂时间窗口。
_Avoid_: timeout, reconnect cache

## Flagged Ambiguities

**Server vs host machine**:
“Server” 指 KTV Room 的协调角色，不指某台物理电脑。需要讨论硬件时，使用“运行 Server 的机器”。

**Master vs Server**:
“Master” 是主显示和放声角色，不是控制全局状态的角色；全局状态属于 **Server**。

**Song vs song file**:
“Song” 是可点播曲目，不是某个具体文件。MV、Lyrics、Original Vocal 和 Accompaniment 是 Song 的关联资产。

**Original Vocal vs Vocal Input**:
“Original Vocal” 是歌曲自带的原唱音频；“Vocal Input” 是演唱者通过 Slave 提供的人声。

**Pin to Next vs Skip**:
“Pin to Next” 改变队列顺序；“Skip” 结束当前播放。二者不应混用。

## Example Dialogue

Dev: 这个 KTV Room 里现在有几个 Slave？

Domain Expert: 一个 Master 和两个已配对的 Slave。两个 Slave 都可以点歌，但同一时间只有一个 Current Song。

Dev: 如果两个 Slave 都开始唱，是两个 Song 各唱各的吗？

Domain Expert: 不是。那是 Chorus Mode，两个 Slave 都为同一个 Current Song 提供 Vocal Input。

Dev: 演唱时用原唱还是伴奏，属于 Slave 的设置吗？

Domain Expert: 不属于。Singing Mode 属于 Current Song 的房间播放状态，切换后所有人听到的基础音频一致。

Dev: 用户点“置顶”时是立刻切歌吗？

Domain Expert: 不是。那是 Pin to Next，只把 Queued Song 提升为下一个播放目标。要结束 Current Song 才是 Skip。

Dev: 一个 Slave 断开后，队列会丢吗？

Domain Expert: 不会。Playback Queue 属于 Server 管理的 KTV Room。断开的只是这个 Slave 的 Vocal Input。
