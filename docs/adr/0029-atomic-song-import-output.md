# Atomic Song Import Output

**Song Import** will build decoded audio, converted lyrics, separated **Accompaniment**, and the generated **Song Manifest** in a temporary work directory, then move the completed **Song** directory into the **Song Asset Directory** only after all required steps succeed. The original **Song Import Source** is retained by default so maintainers can retry failed imports, adjust **Song Import Override**, or inspect source lyric and separation problems without exposing partial songs to **Refresh Song Library**.
