export function deviceCookie(port: number, header: string | undefined) {
  // Forward only the native device-cookie slot. Pi verifies signature, expiry, revocation and remote authority.
  const cookieKey = `p2_owner_${port}=`;
  const cookies = header
    ?.split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(cookieKey));
  if (
    cookies?.length !== 1 ||
    !/^[a-f0-9]{32}\.\d{1,16}\.[a-f0-9]{64}$/.test(
      cookies[0].slice(cookieKey.length),
    )
  )
    return;
  return cookies[0];
}
