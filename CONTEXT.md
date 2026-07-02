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

**Slave Slot**:
**KTV Room** 中可被 **Slave** 占用的演唱输入位置；一个 **KTV Room** 最多有两个 **Slave Slot**。
_Avoid_: mic slot, seat, channel

**Slave Display Name**:
**Slave** 在当前 **KTV Room** 中的可选展示名；未提供时使用其 **Slave Slot** 作为展示名。
_Avoid_: username, account name, profile

**Device**:
连接到 **Server** 的房间角色实例；在本上下文中通常指 **Master** 或 **Slave**，不指运行 Server 的物理机器。
_Avoid_: client, endpoint

**Pairing Code**:
允许 **Slave** 加入当前 **KTV Room** 的四位数字一次性口令。
_Avoid_: password, token, auth code

**Pairing**:
**Slave** 使用 **Pairing Code** 成为当前 **KTV Room** 中已连接输入角色的过程。
_Avoid_: login, registration, binding

**Paired Slave**:
已完成 **Pairing** 并属于当前 **KTV Room** 的 **Slave**；它是房间内的控制和点歌归属身份，不等同于 **Slave Slot**。
_Avoid_: user, account, owner

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

**Timed Lyrics**:
带有演唱时间信息的 **Lyrics**，用于让 **Master** 根据 **Playback Progress** 展示当前唱到的位置。
_Avoid_: LRC, subtitle file, timed subtitles

**Timed Lyric Line**:
**Timed Lyrics** 中的一行歌词，可包含主歌词文本以及同一时间位置上的辅助文本。
_Avoid_: subtitle cue, lyric cue

**Romanized Lyric Text**:
**Timed Lyric Line** 的可选辅助文本，用拉丁字母表示主歌词文本的读音，常用于日语等非拉丁文字歌曲的跟唱。
_Avoid_: romaji field, pinyin field, pronunciation subtitle

**Lyric Translation**:
**Timed Lyric Line** 的可选辅助文本，用于表达主歌词文本的含义；它不作为演唱进度的基准文本。
_Avoid_: subtitle, translated subtitle

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
**Song** 在 **Playback Queue** 中的一次独立出现，尚未成为 **Current Song**；同一首 **Song** 可以对应多个独立的 **Queued Song**，并可归属于添加它的 **Paired Slave**。
_Avoid_: request, order

**Queued Song Attribution**:
**Queued Song** 被加入 **Playback Queue** 时记录的房间内展示归属；它使用当时的 **Slave Display Name**，未提供时使用当时的 **Slave Slot** 展示名，之后不随昵称修改或 slot 复用变化。
_Avoid_: requester, user, account, owner

**Current Song**:
当前正在 **KTV Room** 中播放和演唱的 **Queued Song**；一个 **KTV Room** 同一时间最多只有一个 **Current Song**。
_Avoid_: active track, now playing item

**Playback Progress**:
**Current Song** 在演唱过程中的当前位置；它描述歌曲内的时间进度，不改变 **Playback Queue** 中歌曲的顺序。
_Avoid_: play state, timeline state

**Pin to Next**:
将一个 **Queued Song** 提升为下一个播放目标的队列操作；中文界面可称为“顶歌”。
_Avoid_: 置顶, 下一首, top, priority play, jump queue

**Remove Queued Song**:
将一个尚未播放的 **Queued Song** 从 **Playback Queue** 中移除的队列操作；它不适用于 **Current Song**。
_Avoid_: delete song, cancel song, remove current song

**Skip**:
结束 **Current Song** 并切换到下一个可播放 **Queued Song** 的播放操作。
_Avoid_: cut song, next

**Song End**:
**Current Song** 自然播放到结尾的播放事件；它会结束当前演唱并让 **KTV Room** 进入下一个可播放 **Queued Song**，但不是由演唱者主动触发的 **Skip**。
_Avoid_: auto skip, next song, playback finished

**Unplayable Song**:
**Current Song** 的关联音频资产无法被 **Master** 加载或播放的状态；它表示当前演唱无法继续，不表示 **Song** 已从 **Song Library** 移除。
_Avoid_: broken file, bad song, failed track

### Singing and Audio

**Singing Mode**:
**KTV Room** 当前播放状态中的演唱音频来源选择，作用于 **Current Song**，并在切换到新的 **Current Song** 时沿用当前设置；当前只包含 **Original Vocal Mode** 和 **Accompaniment Mode**。
_Avoid_: mode, audio mode

**Original Vocal Mode**:
使用 **Original Vocal** 作为 **Current Song** 的基础音频，演唱者的人声叠加其上。
_Avoid_: original mode, guide vocal

**Accompaniment Mode**:
使用 **Accompaniment** 作为 **Current Song** 的基础音频，演唱者的人声叠加其上；中文界面称为“伴奏”。
_Avoid_: 伴唱, karaoke mode, instrumental mode

**Chorus Mode**:
两个已配对 **Slave** 同时为同一个 **Current Song** 提供演唱输入的状态。
_Avoid_: duet, two-mic mode

**Vocal Input**:
来自一个 **Slave** 的演唱者人声。
_Avoid_: microphone stream, voice data

**Vocal Input Availability**:
一个已配对 **Slave** 当前是否具备向 **KTV Room** 提供 **Vocal Input** 的条件；取值为 **Unavailable Vocal Input**、**Available Vocal Input** 或 **Interrupted Vocal Input**，且不表示演唱者已经开始演唱。
_Avoid_: microphone permission, audio connection, mic ready

**Unavailable Vocal Input**:
**Slave** 当前没有可供 **KTV Room** 使用的 **Vocal Input**。
_Avoid_: permission denied, no mic, disconnected audio

**Available Vocal Input**:
**Slave** 当前具备可供 **KTV Room** 使用的 **Vocal Input**。
_Avoid_: mic connected, stream ready

**Interrupted Vocal Input**:
**Slave** 之前具备 **Vocal Input**，但当前临时无法被 **KTV Room** 使用，且仍可能恢复。
_Avoid_: reconnecting, broken mic, network issue

**Vocal Input State**:
一个 **Slave Slot** 的 **Vocal Input** 当前是否应该参与 **Mixed Audio** 的房间内状态；它不表示 **Vocal Input Availability**。
_Avoid_: recording state, mic status, speaking

**Mixed Audio**:
**Current Song** 的基础音频与一个或两个 **Vocal Input** 合成后的房间输出音频；它不是可保存或回传给 **Server** 的歌曲资产。
_Avoid_: output stream, final audio

**Progressive Lyric Highlight**:
**Master** 对当前 **Timed Lyric Line** 内部演唱位置的视觉强调，用于表现歌词正在推进，而不要求每个字都有独立时间点。
_Avoid_: word-by-word lyrics, karaoke subtitles

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

**Lyrics vs LRC**:
**Lyrics** 和 **Timed Lyrics** 是领域概念；LRC 只是可能承载它们的一种文件格式，不应作为领域名称。

**Original Vocal vs Vocal Input**:
“Original Vocal” 是歌曲自带的原唱音频；“Vocal Input” 是演唱者通过 Slave 提供的人声。

**Vocal Input Availability vs Vocal Input State**:
**Vocal Input Availability** 描述 Slave 是否具备提供人声的条件；**Vocal Input State** 描述这个人声是否参与当前房间输出。

**Vocal Input Availability vs device error reason**:
**Vocal Input Availability** 是房间协作状态，不是浏览器权限、设备缺失或 WebRTC 连接失败等本地错误原因的分类。

**MV vs room audio**:
**MV** 只表示 **Master** 展示的画面资产；房间可听见的歌曲基础音频来自 **Original Vocal** 或 **Accompaniment**。

**伴奏 vs 伴唱**:
“伴奏”对应 **Accompaniment Mode**；不要使用“伴唱”，以免和 **Original Vocal** 或 **Chorus Mode** 混淆。

**Queued Song Attribution vs Paired Slave**:
**Queued Song Attribution** 是展示用快照；**Paired Slave** 是当前有效配对下的控制和删除权限归属。二者不应混用。

**Pin to Next vs Skip**:
“Pin to Next” 改变队列顺序；“Skip” 结束当前播放。二者不应混用。

**Playback Progress vs Current Song**:
**Playback Progress** 是 **Current Song** 内部的时间位置；**Current Song** 是房间当前正在播放和演唱的队列项。

**Singing Mode vs Replay**:
切换 **Singing Mode** 是改变 **Current Song** 的基础音频来源，不表示重新播放歌曲；切换后应保留当前 **Playback Progress**。

**顶歌 vs 切歌**:
“顶歌”对应 **Pin to Next**，只改变 **Playback Queue** 中的下一个播放目标；“切歌”对应 **Skip**，会结束 **Current Song**。

**Song End vs Skip**:
**Song End** 是 **Current Song** 自然播放完成；**Skip** 是演唱者主动提前结束 **Current Song**。

**Unplayable Song vs Remove Queued Song**:
**Unplayable Song** 是播放时发现的资产问题；**Remove Queued Song** 是演唱者对尚未播放队列项的管理操作。

## Example Dialogue

Dev: 这个 KTV Room 里现在有几个 Slave？

Domain Expert: 一个 Master 和两个已配对的 Slave。两个 Slave 都可以点歌，但同一时间只有一个 Current Song。

Dev: 如果两个 Slave 都开始唱，是两个 Song 各唱各的吗？

Domain Expert: 不是。那是 Chorus Mode，两个 Slave 都为同一个 Current Song 提供 Vocal Input。

Dev: 演唱时用原唱还是伴奏，属于 Slave 的设置吗？切歌后会重置吗？

Domain Expert: 不属于。Singing Mode 属于 KTV Room 的当前播放状态，切换后所有人听到的基础音频一致；切到下一首歌时沿用当前设置。

Dev: 用户点“置顶”时是立刻切歌吗？

Domain Expert: 不是。那是 Pin to Next，只把 Queued Song 提升为下一个播放目标。要结束 Current Song 才是 Skip。

Dev: 一个 Slave 断开后，队列会丢吗？

Domain Expert: 不会。Playback Queue 属于 Server 管理的 KTV Room。断开的只是这个 Slave 的 Vocal Input。
