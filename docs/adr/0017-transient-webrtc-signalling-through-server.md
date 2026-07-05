# Transient WebRTC Signalling Through Server

Superseded by ADR-0031.

WebRTC offer, answer, and ICE candidate messages between **Slave** and **Master** will pass through the **Server** as transient targeted messages, not as **KTV Room** state. The **Server** remains responsible for routing device coordination and tracking **Vocal Input Availability**, but it will not store signalling payloads or include them in broadcast room snapshots.
