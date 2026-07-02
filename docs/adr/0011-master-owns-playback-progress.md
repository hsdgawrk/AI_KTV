# Master Owns Playback Progress

The first playback implementation will treat **Playback Progress** as the actual media position on the connected **Master**, while the **Server** remains authoritative for **Current Song**, **Playback Queue**, and room controls. If the **Master** disconnects or refreshes, the **Server** keeps the **Current Song** but does not continue an independent playback clock; the reconnected **Master** starts playback from the current song again unless a later design adds explicit progress reporting.
