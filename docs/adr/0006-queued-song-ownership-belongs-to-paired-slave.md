# Queued Song Ownership Belongs to Paired Slave

**Queued Song** ownership is bound to the **Paired Slave** that added it, not to the reusable **Slave Slot** or to a long-lived user account. This allows a reconnected **Paired Slave** within the **Reconnection Grace Period** to remove its own queued songs, while preventing a later **Slave** that reuses the same slot from inheriting deletion rights.

