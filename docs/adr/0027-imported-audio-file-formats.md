# Imported Audio File Formats

**Song Import** will preserve decoded source audio as `original.mp3` or `original.flac` according to the real decoded format, while storing the separated **Accompaniment** as `accompaniment.wav`. This avoids an extra lossy transcode before separation, keeps the derived accompaniment easy to inspect, and accepts larger local files because the **Song Asset Directory** is maintained on a Windows machine rather than distributed to browsers as a bundled asset.
