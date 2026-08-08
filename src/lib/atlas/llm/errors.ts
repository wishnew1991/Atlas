import type { LlmProvider } from "./types";

export type LlmErrorKind =
  | "timeout"
  | "auth"
  | "not_found"
  | "rate_limited"
  | "quota"
  | "bad_request"
  | "server_error"
  | "network"
  | "provider";

export interface LlmErrorLike {
  kind: LlmErrorKind;
  status?: number;
  userCopy: string;
  technical: string;
}

function matches(error: Error, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(error.message));
}

export function classifyLlmError(error: Error): LlmErrorLike {
  const message = error.message;

  if (
    error.name === "AbortError" ||
    matches(error, [/timed out/i, /aborted/i, /timeout/i])
  ) {
    return {
      kind: "timeout",
      userCopy: "The model took too long to respond. Please try again.",
      technical: message,
    };
  }

  if (matches(error, [/401/i, /403/i, /invalid api key/i, /unauthorized/i, /authentication/i])) {
    return {
      kind: "auth",
      userCopy: "The model provider rejected the API key. Check your model provider credentials in Settings.",
      technical: message,
    };
  }

  if (matches(error, [/404/i, /not found/i])) {
    return {
      kind: "not_found",
      userCopy: "That model wasn't found on the provider. Try a different model or re-check its ID.",
      technical: message,
    };
  }

  if (matches(error, [/429/i, /rate.?limit/i, /too many requests/i])) {
    return {
      kind: "rate_limited",
      userCopy: "The model provider is rate limiting requests. Wait a moment and try again.",
      technical: message,
    };
  }

  if (matches(error, [/402/i, /quota/i, /insufficient/i, /billing/i])) {
    return {
      kind: "quota",
      userCopy: "The model provider has reached its quota or billing limit for this account.",
      technical: message,
    };
  }

  if (matches(error, [/400/i, /invalid request/i, /bad request/i])) {
    return {
      kind: "bad_request",
      userCopy: "The model request was invalid. Try rephrasing or shortening your message.",
      technical: message,
    };
  }

  if (matches(error, [/5\d\d/, /internal server error/i, /service unavailable/i, /upstream/i])) {
    return {
      kind: "server_error",
      userCopy: "The model provider is temporarily unavailable. Please try again shortly.",
      technical: message,
    };
  }

  if (matches(error, [/fetch failed/i, /network/i, /enotfound/i, /enetunreach/i, /econnreset/i, /und_?(_)?err/i, /connect/i])) {
    return {
      kind: "network",
      userCopy: "Couldn't reach the model provider. Check your connection and try again.",
      technical: message,
    };
  }

  return {
    kind: "provider",
    userCopy: "The model provider returned an error. Please try again.",
    technical: message,
  };
}

export function toLlmError(error: unknown, provider: LlmProvider): LlmErrorLike {
  if (error instanceof Error) return classifyLlmError(error);
  return {
    kind: "provider",
    userCopy: "The model provider returned an unexpected error.",
    technical: String(error),
  };
}

export function llmUserCopy(error: unknown, provider: LlmProvider): string {
  return toLlmError(error, provider).userCopy;
}

export function llmTechnicalMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export class LlmRequestError extends Error {
  readonly kind: LlmErrorKind;
  readonly status?: number;
  readonly userCopy: string;

  constructor(classifier: LlmErrorLike) {
    super(classifier.technical);
    this.name = "LlmRequestError";
    this.kind = classifier.kind;
    this.status = classifier.status;
    this.userCopy = classifier.userCopy;
  }

  static from(error: unknown, provider: LlmProvider): LlmRequestError {
    return new LlmRequestError(toLlmError(error, provider));
  }
}