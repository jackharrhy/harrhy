export interface DeploymentBindings {
  HARRHY_CLANK_SOURCE_PORT?: string;
  HARRHY_CLANK_MODE?: string;
  HARRHY_CLANK_PUBLIC_ORIGIN?: string;
}

export function deployment(env: DeploymentBindings) {
  const mode = env.HARRHY_CLANK_MODE ?? "fixture";
  if (
    mode === "fixture" &&
    env.HARRHY_CLANK_PUBLIC_ORIGIN === undefined &&
    env.HARRHY_CLANK_SOURCE_PORT === undefined
  )
    return {
      readOnly: false,
      sourcePort: 18149,
      origin: new URL("http://127.0.0.1:18148"),
    };
  if (mode !== "read-only" || !env.HARRHY_CLANK_PUBLIC_ORIGIN) return null;
  let origin: URL;
  try {
    origin = new URL(env.HARRHY_CLANK_PUBLIC_ORIGIN);
  } catch {
    return null;
  }
  if (
    origin.origin !== env.HARRHY_CLANK_PUBLIC_ORIGIN ||
    !(
      origin.protocol === "https:" ||
      (origin.protocol === "http:" && origin.hostname === "127.0.0.1")
    )
  )
    return null;
  const sourcePort = Number(env.HARRHY_CLANK_SOURCE_PORT);
  if (
    !Number.isInteger(sourcePort) ||
    sourcePort < 1 ||
    sourcePort > 65535 ||
    sourcePort === 18149
  )
    return null;
  return { readOnly: true, origin, sourcePort };
}
