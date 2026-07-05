# Independent ncmdecode Tool Build

The C++ **Source Audio Decode** tool will live under `tools/ncmdecode/` as an independently built command-line executable, rather than being part of the normal Node/Vite build. **Song Import** will call the executable by path, so day-to-day **KTV Room** development does not require a C++ toolchain while Windows machines that maintain the **Song Asset Directory** can build or install the decoder when needed.
