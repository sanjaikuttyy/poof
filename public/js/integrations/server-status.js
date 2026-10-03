export function watchServer({ onStatus }) {
  let pending = false;
  async function check() {
    if (pending) return;
    pending = true;
    try {
      const r = await fetch("/api/health", {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      const data = await r.json();
      onStatus(r.ok && data.ok === true);
    } catch {
      onStatus(false);
    } finally {
      pending = false;
    }
  }
  const timer = setInterval(() => {
    if (!document.hidden) check();
  }, 15000);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
  window.addEventListener("pagehide", () => clearInterval(timer), {
    once: true,
  });
  check();
  return check;
}
