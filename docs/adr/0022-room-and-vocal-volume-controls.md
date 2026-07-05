# Room Volume Controls

Updated by ADR-0031 to remove **Vocal Volume**.

**Accompaniment Volume** is a room-level 0-100 integer setting that starts at 70, any connected **Paired Slave** may adjust, and it persists across **Current Song** changes; setting it to 0 mutes the base audio without pausing playback or **Playback Progress**. **Master** may show room volume as read-only status but is not a volume control surface in the first implementation. Clients should throttle slider updates while guaranteeing the final value is sent, while the **Server** simply applies each valid command, clamps and rounds incoming values because clients are not trusted, and keeps per-song asset loudness correction outside the room volume model.
