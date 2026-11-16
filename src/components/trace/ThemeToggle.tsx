"use client";
import { useSyncExternalStore } from "react";

function subscribeTheme(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

const getTheme = (): "dark" | "light" =>
  document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";

const getServerTheme = (): "dark" | "light" => "dark";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("trace.theme", next);
    } catch {}
  };
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={`border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-mute transition hover:border-accent hover:text-accent ${className}`}
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
