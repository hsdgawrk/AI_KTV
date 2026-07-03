export const LOW_LATENCY_RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: []
};

type LowLatencyMediaTrackConstraints = MediaTrackConstraints & {
  latency?: { ideal: number };
};

type LowLatencySupportedConstraints = MediaTrackSupportedConstraints & {
  latency?: boolean;
};

const COMPATIBLE_VOCAL_INPUT_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    autoGainControl: false,
    echoCancellation: true,
    noiseSuppression: true
  },
  video: false
};

export async function getLowLatencyVocalInputStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(getLowLatencyVocalInputConstraints());
  } catch (error: unknown) {
    console.warn("AI-KTV low latency microphone constraints rejected, falling back", error);
    return navigator.mediaDevices.getUserMedia(COMPATIBLE_VOCAL_INPUT_CONSTRAINTS);
  }
}

const OPUS_LOW_LATENCY_PARAMETERS = new Map([
  ["cbr", "1"],
  ["maxaveragebitrate", "128000"],
  ["stereo", "0"],
  ["sprop-stereo", "0"]
]);

export function preferLowLatencyOpus(description: RTCSessionDescriptionInit): RTCSessionDescriptionInit {
  if (!description.sdp) return description;
  return { type: description.type, sdp: preferLowLatencyOpusSdp(description.sdp) };
}

export async function setLowLatencyLocalDescription(
  peer: RTCPeerConnection,
  description: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> {
  const preferredDescription = preferLowLatencyOpus(description);
  if (preferredDescription.sdp === description.sdp) {
    await peer.setLocalDescription(description);
    return description;
  }

  try {
    await peer.setLocalDescription(preferredDescription);
    return preferredDescription;
  } catch (error: unknown) {
    console.warn("AI-KTV low latency SDP rejected, falling back", error);
    await peer.setLocalDescription(description);
    return description;
  }
}

export function configureLowLatencyAudioSender(sender: RTCRtpSender): void {
  try {
    const parameters = sender.getParameters();
    if (!parameters.encodings || parameters.encodings.length === 0) return;

    parameters.encodings = parameters.encodings.map((encoding) => ({
      ...encoding,
      maxBitrate: 128_000
    }));

    sender.setParameters(parameters).catch((error: unknown) => {
      console.warn("AI-KTV low latency audio sender parameters rejected", error);
    });
  } catch (error: unknown) {
    console.warn("AI-KTV low latency audio sender parameters rejected", error);
  }
}

export function configureLowLatencyAudioReceiver(receiver: RTCRtpReceiver): void {
  try {
    const lowLatencyReceiver = receiver as RTCRtpReceiver & { playoutDelayHint?: number };
    if ("playoutDelayHint" in lowLatencyReceiver) lowLatencyReceiver.playoutDelayHint = 0;
  } catch (error: unknown) {
    console.warn("AI-KTV low latency audio receiver parameters rejected", error);
  }
}

export function markTrackAsLiveVocal(track: MediaStreamTrack): void {
  try {
    track.contentHint = "music";
  } catch (error: unknown) {
    console.warn("AI-KTV live vocal track hint rejected", error);
  }
}

function getLowLatencyVocalInputConstraints(): MediaStreamConstraints {
  const supported: LowLatencySupportedConstraints = navigator.mediaDevices.getSupportedConstraints?.() ?? {};
  const audio: LowLatencyMediaTrackConstraints = {};

  if (supported.autoGainControl) audio.autoGainControl = { ideal: false };
  if (supported.channelCount) audio.channelCount = { ideal: 1 };
  if (supported.echoCancellation) audio.echoCancellation = { ideal: false };
  if (supported.latency) audio.latency = { ideal: 0.01 };
  if (supported.noiseSuppression) audio.noiseSuppression = { ideal: false };
  if (supported.sampleRate) audio.sampleRate = { ideal: 48000 };

  return {
    audio: Object.keys(audio).length > 0 ? audio : true,
    video: false
  };
}

function preferLowLatencyOpusSdp(sdp: string): string {
  const lines = sdp.replace(/\r\n/g, "\n").split("\n");
  const opusPayload = findOpusPayload(lines);
  if (!opusPayload) return sdp;

  const audioSection = findMediaSection(lines, "audio");
  if (!audioSection) return sdp;

  const fmtpIndex = findPayloadAttributeIndex(lines, audioSection.start, audioSection.end, opusPayload, "fmtp");
  if (fmtpIndex >= 0) {
    lines[fmtpIndex] = mergeFmtpParameters(lines[fmtpIndex], OPUS_LOW_LATENCY_PARAMETERS);
  } else {
    const rtpMapIndex = findPayloadAttributeIndex(lines, audioSection.start, audioSection.end, opusPayload, "rtpmap");
    lines.splice(rtpMapIndex + 1, 0, `a=fmtp:${opusPayload} ${formatFmtpParameters(OPUS_LOW_LATENCY_PARAMETERS)}`);
    audioSection.end += 1;
  }

  return lines.join("\r\n");
}

function findOpusPayload(lines: string[]): string | undefined {
  const opusRtpMap = /^a=rtpmap:(\d+)\s+opus\/48000(?:\/\d+)?$/i;
  for (const line of lines) {
    const match = opusRtpMap.exec(line);
    if (match) return match[1];
  }
  return undefined;
}

function findMediaSection(lines: string[], kind: string): { start: number; end: number } | undefined {
  const start = lines.findIndex((line) => line.startsWith(`m=${kind} `));
  if (start < 0) return undefined;

  const nextMedia = lines.findIndex((line, index) => index > start && line.startsWith("m="));
  return { start, end: nextMedia < 0 ? lines.length : nextMedia };
}

function findPayloadAttributeIndex(
  lines: string[],
  start: number,
  end: number,
  payload: string,
  attribute: string
): number {
  const prefix = `a=${attribute}:${payload}`;
  for (let index = start; index < end; index += 1) {
    if (lines[index].startsWith(prefix)) return index;
  }
  return -1;
}

function mergeFmtpParameters(line: string, nextParameters: Map<string, string>): string {
  const separatorIndex = line.indexOf(" ");
  if (separatorIndex < 0) return `${line} ${formatFmtpParameters(nextParameters)}`;

  const prefix = line.slice(0, separatorIndex);
  const parameters = parseFmtpParameters(line.slice(separatorIndex + 1));
  for (const [key, value] of nextParameters) parameters.set(key, value);
  return `${prefix} ${formatFmtpParameters(parameters)}`;
}

function parseFmtpParameters(parameterText: string): Map<string, string> {
  const parameters = new Map<string, string>();
  for (const rawParameter of parameterText.split(";")) {
    const parameter = rawParameter.trim();
    if (!parameter) continue;

    const equalsIndex = parameter.indexOf("=");
    if (equalsIndex < 0) {
      parameters.set(parameter, "");
      continue;
    }

    parameters.set(parameter.slice(0, equalsIndex).trim(), parameter.slice(equalsIndex + 1).trim());
  }
  return parameters;
}

function formatFmtpParameters(parameters: Map<string, string>): string {
  return [...parameters]
    .map(([key, value]) => (value ? `${key}=${value}` : key))
    .join(";");
}
