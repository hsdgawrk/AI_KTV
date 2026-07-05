# Direct Slave Vocal Input to Master

Superseded by ADR-0031.

**Slave** will capture **Vocal Input** locally and send it directly to the connected **Master** over WebRTC, while the **Server** only coordinates room state and WebRTC signalling. This keeps **Mixed Audio** close to the room output device, prioritises low-latency singing in a local KTV room, and avoids making the **Server** responsible for audio devices, media forwarding, or mixing.
