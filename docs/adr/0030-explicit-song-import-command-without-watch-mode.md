# Explicit Song Import Command Without Watch Mode

The first **Batch Song Import** implementation will run only as an explicit maintenance command and will not watch a download directory. Download-directory monitoring would add partially-written file handling, duplicate trigger suppression, background retry policy, and long-running process behavior before the import pipeline itself is stable; maintainers can rerun the explicit command after adding or fixing **Song Import Source** directories.
