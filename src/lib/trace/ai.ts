import type { Claim, Finding, PageReport } from "./types";

/**
 * Optional AI layer. TRACE's core analysis is fully deterministic and works without any provider.
 * A provider can be plugged in later (server-side only; credentials must come from process.env and
 * never reach the browser). Results from a provider must always be labelled as AI-generated.
 */
export interface AIProvider {
  readonly name: string;
  summarizePage(page: PageReport): Promise<string | null>;
  classifyPage(page: PageReport): Promise<{ type: PageReport["type"]; confidence: number } | null>;
  extractClaims(page: PageReport): Promise<Claim[]>;
  explainFinding(finding: Finding): Promise<string | null>;
}

/** Default provider: performs no AI calls and returns nothing. */
export const NoopAIProvider: AIProvider = {
  name: "none",
  async summarizePage() {
    return null;
  },
  async classifyPage() {
    return null;
  },
  async extractClaims() {
    return [];
  },
  async explainFinding() {
    return null;
  },
};

export function getAIProvider(): AIProvider {
  // Intentionally returns the no-op provider: no API key is required for TRACE to work.
  return NoopAIProvider;
}
