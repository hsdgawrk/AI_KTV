# Audio Source Switch Timeout

When **Singing Mode** changes during a **Current Song**, the **Master** will preserve **Playback Progress**, pause briefly while loading the target audio source, seek it to the current position, and resume playback. Local assets should normally resume within about 500ms, but the first implementation will use a 2s timeout to avoid getting stuck in a source-switching state and then treat the song as unplayable if the target source cannot resume, without automatically falling back to the previous **Singing Mode**.
