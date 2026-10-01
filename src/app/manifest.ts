import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TRACE — Website Intelligence Platform",
    short_name: "TRACE",
    description: "The X-ray for the Web — Website Intelligence, Architectural Visualization, and Technical Audits by Teja Priyan.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0d",
    theme_color: "#0b0b0d",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
