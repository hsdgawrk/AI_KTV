# AI-KTV

AI-KTV 是一个面向单个本地 KTV 房间的点歌、播放和演唱上下文。它描述房间内的设备角色、歌曲资产、播放队列和演唱模式之间的关系。

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
KTV Room 的点歌和房间控制角色，由演唱者使用；一个 KTV Room 最多同时有两个已配对的 Slave。
_Avoid_: phone, remote, microphone client, vocal input device

**Slave Slot**:
**KTV Room** 中可被 **Slave** 占用的配对位置；一个 **KTV Room** 最多有两个 **Slave Slot**。
_Avoid_: mic slot, seat, channel, input channel

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
**Slave** 使用 **Pairing Code** 成为当前 **KTV Room** 中已连接控制角色的过程。
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

**Song Search**:
**Slave** 为点歌而向 **Server** 查询当前 **Song Library** 的房间操作；它返回可点播 **Song** 的有限结果集，而不是把完整 **Song Library** 交给 **Slave** 自行筛选。
_Avoid_: local filter, catalog download, browser search

**Song Search Result**:
一次 **Song Search** 返回的可点播 **Song** 摘要集合；它不表示 **Song Library** 的完整内容，也不包含播放资产。
_Avoid_: full song list, search page, playlist

**Refresh Song Library**:
让 **Server** 重新从 **Song Asset Directory** 形成当前 **Song Library** 的房间操作；它只影响之后可点播的 **Song**，不改写已有 **Queued Song** 或 **Current Song**。
_Avoid_: reload files, rescan media, sync playlist

**Song Library Refresh Issue**:
**Refresh Song Library** 发现的曲库维护问题，分为 **Blocking Song Library Refresh Issue** 和 **Non-blocking Song Library Refresh Issue**；它不表示正在播放的 **Current Song** 不可播放。
_Avoid_: broken song, playback error, bad track

**Blocking Song Library Refresh Issue**:
阻止某个候选 **Song** 进入当前 **Song Library** 的 **Song Library Refresh Issue**。
_Avoid_: fatal error, invalid track, rejected file

**Non-blocking Song Library Refresh Issue**:
不阻止候选 **Song** 进入当前 **Song Library**，但提示该 **Song** 仍需维护完善的 **Song Library Refresh Issue**。
_Avoid_: info, lint, minor problem

**Song Asset Directory**:
**Server** 用来发现可点播 **Song** 的固定本地资产集合；它是 **Song Library** 的维护来源，不是演唱者在房间内管理队列的地方。
_Avoid_: upload library, management console, media database

**Song Import Source**:
用于生成一个 **Song** 及其关联资产的单曲外部来源目录；它不属于 **Song Library**，也不直接被 **Master** 播放。
_Avoid_: song, library item, playable asset, loose files

**Song Import Override**:
**Song Import Source** 中用于修正导入结果的人维护记录；它影响生成的 **Song Manifest**，但本身不是 **Song Manifest**。
_Avoid_: song.json, metadata cache, config

**Song Import**:
把一个 **Song Import Source** 转换成 **Song Asset Directory** 中一个可扫描 **Song** 的曲库维护操作。
_Avoid_: upload, playback, queue action

**Batch Song Import**:
一次处理多个 **Song Import Source** 的曲库维护操作；每个来源目录独立成功或失败，失败不阻止其他来源目录完成 **Song Import**。
_Avoid_: all-or-nothing import, playlist import, library sync

**Replace Imported Song**:
显式允许 **Song Import** 替换 **Song Asset Directory** 中已有 **Song** 资产的曲库维护操作；它不改写已经存在的 **Queued Song** 或 **Current Song**。
_Avoid_: overwrite queue, update current song, sync existing requests

**Source Audio Decode**:
**Song Import** 中把来源音频转换成 **Original Vocal** 可播放资产的步骤；它不改变 **Song** 的身份，也不直接进入 **Playback Queue**。
_Avoid_: playback, streaming, recording

**Source Lyrics Conversion**:
**Song Import** 中把来源歌词转换成 **Timed Lyrics** 的步骤；来源歌词格式不应成为 **Song Library** 的领域名称。
_Avoid_: LRC support, subtitle import, lyric playback

**Song Manifest**:
描述一个 **Song** 及其关联资产的人维护记录；一个 **Song Manifest** 对应一个可进入 **Song Library** 的 **Song**。
_Avoid_: filename convention, inferred metadata, config snippet

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
使用 **Original Vocal** 作为 **Current Song** 的房间播放音频。
_Avoid_: original mode, guide vocal

**Accompaniment Mode**:
使用 **Accompaniment** 作为 **Current Song** 的房间播放音频；中文界面称为“伴奏”。
_Avoid_: 伴唱, karaoke mode, instrumental mode

**Progressive Lyric Highlight**:
**Master** 对当前 **Timed Lyric Line** 内部演唱位置的视觉强调，用于表现歌词正在推进，而不要求每个字都有独立时间点。
_Avoid_: word-by-word lyrics, karaoke subtitles

**Accompaniment Volume**:
影响整个 **KTV Room** 中 **Current Song** 基础音频响度的音量设置。
_Avoid_: music volume, master volume

### Connection States

**Disconnected Slave**:
曾经配对但当前失去连接的 **Slave**；它不能继续发起房间控制或点歌操作。
_Avoid_: offline phone, muted mic, disconnected microphone

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

**Song Library vs Song Asset Directory**:
**Song Library** 是当前房间可点播的曲目集合；**Song Asset Directory** 是维护这些曲目和资产的本地来源。

**Song Import Source vs Song**:
**Song Import Source** 是曲库维护时使用的外部来源文件集合；只有完成 **Song Import** 并进入 **Song Asset Directory** 后，才可能被 **Refresh Song Library** 形成 **Song**。

**Song Import Override vs Song Manifest**:
**Song Import Override** 修正导入时如何生成 **Song Manifest**；**Song Manifest** 是导入完成后 **Song Asset Directory** 中用于形成 **Song** 的维护记录。

**Replace Imported Song vs Queued Song**:
**Replace Imported Song** 只替换 **Song Asset Directory** 中的维护资产；已经存在的 **Queued Song** 和 **Current Song** 仍遵循点歌时的 **Song** 快照语义。

**Song Library vs Song Search Result**:
**Song Library** 是 **Server** 管理的完整可点播曲目集合；**Song Search Result** 是 **Slave** 为当前点歌查询看到的有限结果。

**Song Search Result vs Queued Song**:
**Song Search Result** 只是可选择的查询结果，可能因 **Refresh Song Library** 过期；只有成功加入 **Playback Queue** 后，才形成稳定的 **Queued Song** 快照。

**Refresh Song Library vs Queued Song**:
**Refresh Song Library** 不会重新解释或替换已经进入 **Playback Queue** 的 **Queued Song**；它只改变之后能从 **Song Library** 点播的歌曲集合。

**Queued Song vs current Song Library membership**:
**Queued Song** 使用点歌时的 **Song** 快照，即使之后的 **Refresh Song Library** 让该 **Song** 不再出现在当前 **Song Library**，它仍可继续排队、被顶歌、被删除或成为 **Current Song**。

**Queued Song ownership vs disconnected owner**:
拥有 **Queued Song** 的 **Paired Slave** 暂时断开时，其他 **Slave** 不会获得该 **Queued Song** 的删除权限。

**Queued Song ownership vs expired owner**:
拥有 **Queued Song** 的 **Paired Slave** 超过 **Reconnection Grace Period** 后，该 **Queued Song** 仍留在 **Playback Queue**，但删除权限不会转移给其他 **Slave**。

**Disconnected Slave vs playback flow**:
**Slave** 断开只影响该 **Slave** 的控制入口，不暂停 **Current Song**，也不阻止 **Song End** 推进 **Playback Queue**。

**Song Library Refresh Issue vs Unplayable Song**:
**Song Library Refresh Issue** 是曲库维护时发现的候选歌曲问题；**Blocking Song Library Refresh Issue** 会阻止候选 **Song** 进入 **Song Library**，但 **Unplayable Song** 是 **Master** 播放 **Current Song** 时发现的资产播放问题。

**Lyrics vs LRC**:
**Lyrics** 和 **Timed Lyrics** 是领域概念；LRC 只是可能承载它们的一种文件格式，不应作为领域名称。

**MV vs room audio**:
**MV** 只表示 **Master** 展示的画面资产；房间可听见的歌曲基础音频来自 **Original Vocal** 或 **Accompaniment**。

**伴奏 vs 伴唱**:
“伴奏”对应 **Accompaniment Mode**；不要使用“伴唱”，以免和 **Original Vocal** 混淆。

**Queued Song Attribution vs Paired Slave**:
**Queued Song Attribution** 是展示用快照；**Paired Slave** 是当前有效配对下的控制和删除权限归属。二者不应混用。

**Queued Song Attribution vs expired owner**:
即使 **Queued Song** 的原 **Paired Slave** 已超过 **Reconnection Grace Period**，**Queued Song Attribution** 仍保留点歌时的展示文本；它不表示当前仍有删除权限。

**Pin to Next vs Skip**:
“Pin to Next” 改变队列顺序；“Skip” 结束当前播放。二者不应混用。

**Pin to Next vs Queued Song ownership**:
**Pin to Next** 是已配对 **Slave** 对房间队列顺序的协作操作，不要求操作者拥有目标 **Queued Song**；**Remove Queued Song** 才受 **Queued Song** 的归属限制。

**Skip vs Queued Song ownership**:
**Skip** 是已配对 **Slave** 对 **Current Song** 的房间播放操作，不要求操作者拥有当前歌曲。

**Playback Progress vs Current Song**:
**Playback Progress** 是 **Current Song** 内部的时间位置；**Current Song** 是房间当前正在播放和演唱的队列项。

**Singing Mode vs Replay**:
切换 **Singing Mode** 是改变 **Current Song** 的基础音频来源，不表示重新播放歌曲；切换后应保留当前 **Playback Progress**。

**Accompaniment Volume vs playback state**:
**Accompaniment Volume** 只描述基础音频响度；即使为 0，也不暂停 **Current Song** 或 **Playback Progress**。

**顶歌 vs 切歌**:
“顶歌”对应 **Pin to Next**，只改变 **Playback Queue** 中的下一个播放目标；“切歌”对应 **Skip**，会结束 **Current Song**。

**Song End vs Skip**:
**Song End** 是 **Current Song** 自然播放完成；**Skip** 是演唱者主动提前结束 **Current Song**。

**Unplayable Song vs Remove Queued Song**:
**Unplayable Song** 是播放时发现的资产问题；**Remove Queued Song** 是演唱者对尚未播放队列项的管理操作。

**Remove Queued Song vs Current Song ownership**:
即使 **Current Song** 来自某个 **Paired Slave**，它也不能被 **Remove Queued Song** 移除；结束 **Current Song** 使用 **Skip**。

## Example Dialogue

Dev: 这个 KTV Room 里现在有几个 Slave？

Domain Expert: 一个 Master 和两个已配对的 Slave。两个 Slave 都可以点歌，但同一时间只有一个 Current Song。

Dev: 演唱时用原唱还是伴奏，属于 Slave 的设置吗？切歌后会重置吗？

Domain Expert: 不属于。Singing Mode 属于 KTV Room 的当前播放状态，切换后所有人听到的基础音频一致；切到下一首歌时沿用当前设置。

Dev: 用户点“置顶”时是立刻切歌吗？

Domain Expert: 不是。那是 Pin to Next，只把 Queued Song 提升为下一个播放目标。要结束 Current Song 才是 Skip。

Dev: 一个 Slave 断开后，队列会丢吗？

Domain Expert: 不会。Playback Queue 属于 Server 管理的 KTV Room。断开的只是这个 Slave 的控制入口。

Dev: 想加一首歌，是直接改 Song Library 吗？

Domain Expert: 不直接改房间状态里的 Song Library。维护 Song Asset Directory 中的 Song Manifest 和关联资产，Server 再从那里形成当前房间的 Song Library。

Dev: 下载得到的音乐和歌词文件会直接进入 Song Library 吗？

Domain Expert: 不会。它们是 Song Import Source，只有完成 Song Import 并生成 Song Asset Directory 中的 Song 资产后，Refresh Song Library 才会让它可点播。

Dev: 刷新曲库会把队列里已经点的歌也换成新版本吗？

Domain Expert: 不会。Refresh Song Library 只影响之后可点播的 Song；Queued Song 和 Current Song 继续使用点歌时的 Song 快照。

Dev: Slave 会拿到完整 Song Library 自己搜索吗？

Domain Expert: 不会。Slave 发起 Song Search，Server 在当前 Song Library 中查询并返回 Song Search Result。

Dev: 刷新曲库时有一首歌的资产写错了，整个 Song Library 都失败吗？

Domain Expert: 不会。那首候选 Song 会产生 Blocking Song Library Refresh Issue，其他可用 Song 仍可进入 Song Library；如果没有任何可用 Song，则保留旧的 Song Library。
