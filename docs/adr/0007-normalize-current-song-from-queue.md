# Normalize Current Song from Queue

The **Server** keeps the room state normalized so a non-empty **Playback Queue** does not coexist with an empty **Current Song**. When no **Current Song** exists and queued content is available, the first **Queued Song** is promoted to **Current Song** without resetting the current **Singing Mode**; this keeps add, skip, and remove behavior consistent even after unusual intermediate states.

