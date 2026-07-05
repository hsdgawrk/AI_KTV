# Master Local Mixed Audio Output

Superseded by ADR-0031.

The first **Mixed Audio** implementation will exist only inside the connected **Master** browser and will output to the Master device speakers. It will not be recorded, returned to **Slave**, or sent back to the **Server**, keeping the first real singing loop focused on low-latency room output rather than recording, monitoring, scoring, or server-side audio processing.
