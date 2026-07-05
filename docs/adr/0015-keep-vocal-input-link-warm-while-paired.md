# Keep Vocal Input Link Warm While Paired

Superseded by ADR-0031.

After a **Slave** is paired, it will request access to **Vocal Input** and keep its audio path to the **Master** available while it remains paired. Starting or stopping singing changes whether that **Vocal Input** participates in **Mixed Audio**; it does not create or tear down the media path, because first-note latency and browser permission prompts would otherwise interrupt the singing flow.
