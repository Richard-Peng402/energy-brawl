import "./styles.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root element");

if (window.location.pathname === "/host") {
  const { localHostConsoleUrl } = await import("./host-console-url");
  const localUrl = localHostConsoleUrl(window.location);
  if (localUrl) window.location.replace(localUrl);
  const { HostApp } = await import("./host-app");
  if (!localUrl) new HostApp(root);
} else {
  const { MobileApp } = await import("./mobile-app");
  new MobileApp(root);
}
