# Vocal Input Capture Constraints

Superseded by ADR-0031.

The first **Vocal Input** capture will prioritise low **Vocal Input Latency** over browser voice-processing features. It will prefer a live, single-channel capture path with automatic gain control, echo cancellation, and noise suppression disabled when the browser supports those constraints. If a browser rejects the low-latency constraints, the **Slave** may fall back to a more compatible capture path.

Local room singing still needs protection against speaker bleed from the **Master**, but browser voice processing can add delay and make singing dynamics unstable. Echo cancellation and noise suppression should therefore be treated as optional compatibility controls rather than the default path for low-latency singing; richer vocal effects such as reverb, compression, or equalisation remain outside the first implementation.
