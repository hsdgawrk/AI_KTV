# Inline Timed Lyrics in Song Library

Superseded by [ADR-0020](./0020-scan-song-asset-directory-with-per-song-manifests.md).

The first playback implementation will keep **Timed Lyrics** inline in the static **Song Library** rather than loading or parsing separate lyric files. This makes **Progressive Lyric Highlight** immediately testable with the existing seeded songs while deferring file format decisions such as LRC or JSON until asset import and larger library management become real requirements.
