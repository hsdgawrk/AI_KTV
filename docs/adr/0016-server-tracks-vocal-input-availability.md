# Server Tracks Vocal Input Availability

The **Server** will track **Vocal Input Availability** for each **Slave Slot** as part of authoritative room state, while still avoiding all media handling. This lets every connected **Master** and **Slave** see the same microphone readiness state and lets room commands reject impossible singing transitions without making the **Server** a WebRTC media participant.
