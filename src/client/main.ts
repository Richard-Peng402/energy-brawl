import "./styles.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root element");

if (window.location.pathname === "/host") {
  const { HostApp } = await import("./host-app");
  new HostApp(root);
} else {
  const { MobileApp } = await import("./mobile-app");
  new MobileApp(root);
}
