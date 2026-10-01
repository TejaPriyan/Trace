"use client";
import { useEffect, useState } from "react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
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
