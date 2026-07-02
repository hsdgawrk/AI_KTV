# Line-Timed Lyrics with Progressive Highlight

The first lyrics implementation will use **Timed Lyrics** with line-level timing and derive **Progressive Lyric Highlight** within the current line from the surrounding line timing instead of requiring per-character timestamps. This keeps the asset format light enough for the first playback slice while still avoiding static or purely line-by-line lyrics, and leaves room for future **Timed Lyric Line** layers such as Japanese lyrics and romanized text.
