# Server Restart Starts a New KTV Room

For the project skeleton, a **Server** restart starts a new local **KTV Room** lifecycle. Pairing state, **Playback Queue**, **Current Song**, and room settings are not restored, while the fixed **Song Library** remains available as seeded room content; this keeps persistence and recovery semantics out of the first skeleton.

