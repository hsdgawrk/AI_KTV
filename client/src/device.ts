export const deviceId = getOrCreateDeviceId();

function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem("aiKtvDeviceId");
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem("aiKtvDeviceId", next);
  return next;
}
