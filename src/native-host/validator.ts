// native/validator.ts (Node/Electron)

export interface ExtractionRequest {
  id: string;
  url: string;
  title: string;
  // At least one of: text, html
  text?: string;
  html?: string;
  wordCount?: number;
  selectedOnly?: boolean;
  nodeCount?: number;
  htmlSize?: number; // bytes
}

const NATIVE_LIMITS = {
  TEXT_CHARS: 120000, // slightly higher threshold than client to allow minor differences
  HTML_BYTES: 350 * 1024,
  WORDS: 25000,
  NODE_COUNT: 100000
};

export function validateNativePayload(payload: ExtractionRequest): {
  ok: boolean;
  reason?: string;
} {
  if (!payload) return { ok: false, reason: 'invalid_payload' };
  if (!payload.selectedOnly) {
    if ((payload.wordCount ?? 0) > NATIVE_LIMITS.WORDS) {
      return { ok: false, reason: 'Page contains too many words to process.' };
    }
    if ((payload.htmlSize ?? 0) > NATIVE_LIMITS.HTML_BYTES) {
      return { ok: false, reason: 'HTML size too large to process.' };
    }
    if ((payload.nodeCount ?? 0) > NATIVE_LIMITS.NODE_COUNT) {
      return { ok: false, reason: 'Page has too many DOM nodes to process.' };
    }
    if ((payload.text?.length ?? 0) > NATIVE_LIMITS.TEXT_CHARS) {
      return { ok: false, reason: 'Text content too long to process.' };
    }
  } else {
    if ((payload.text?.length ?? 0) > NATIVE_LIMITS.TEXT_CHARS) {
      return { ok: false, reason: 'Selected text too long to process.' };
    }
  }
  return { ok: true };
}
