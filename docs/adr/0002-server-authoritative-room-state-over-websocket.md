# Server Authoritative Room State over WebSocket

The **Server** is the only authority for **Playback Queue**, **Current Song**, pairing state, and **Singing Mode**. **Master** and **Slave** send commands, and the **Server** validates them, updates the room state, and broadcasts the resulting state over WebSocket so all connected devices observe the same **KTV Room** state without local optimistic divergence.

