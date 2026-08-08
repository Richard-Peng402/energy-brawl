export interface HostLocation {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
}

export function localHostConsoleUrl(location: HostLocation): string | null {
  if (location.pathname !== "/host") return null;
  const hostname = location.hostname.toLowerCase();
  if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]") return null;
  const port = location.port ? `:${location.port}` : "";
  return `${location.protocol}//127.0.0.1${port}${location.pathname}${location.search}`;
}
