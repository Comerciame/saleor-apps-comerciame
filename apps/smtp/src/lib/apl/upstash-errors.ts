// Custom error types
export class UpstashAplMisconfiguredError extends Error {
  constructor(public missingVars: string[]) {
    super(`Missing configuration for: ${missingVars.join(", ")}`);
  }
}

export class UpstashAplNotConfiguredError extends Error {
  constructor() {
    super("Upstash APL is not configured properly.");
  }
}
