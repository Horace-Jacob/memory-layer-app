/* native-host/index.ts
 *
 * Production-ready native messaging host:
 * - Reads Chrome length-prefixed messages from stdin
 * - Validates request
 * - Forwards to Electron via localhost TCP (JSON newline-delimited)
 * - Waits for Electron response and writes length-prefixed JSON back to stdout
 * - Never writes non-protocol text to stdout (logs to file only)
 *
 * Build with: tsc -> compile to JS (node 18+), or use pkg on compiled JS
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as net from 'net';

const LOG_PATH = path.join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'native-host.log');
const IPC_PORT = parseInt(process.env.ELECTRON_BRIDGE_PORT || '12346', 10);

// Limits and timeouts
const MAX_MESSAGE_BYTES = 10 * 1024 * 1024; // 10MB
const ELECTRON_CONNECT_TIMEOUT = 700; // ms to connect
const ELECTRON_RESPONSE_TIMEOUT = 15_000; // ms to wait for electron response

type ExtractionRequest = {
  id: string;
  url: string;
  title: string;
  text: string;
  html?: string;
  wordCount?: number;
  selectedOnly?: boolean;
};

type HostResponse = {
  id: string;
  ok: boolean;
  reason?: string;
  processed?: {
    url?: string;
    title?: string;
    content?: string;
    wordCount?: number;
    excerpt?: string;
    byline?: string;
    readingTime?: number;
    savedId?: string;
  };
};

// safe async logger (stderr-like file)
const log = async (msg: string): Promise<void> => {
  const line = `${new Date().toISOString()} - ${msg}\n`;
  try {
    await fs.appendFile(LOG_PATH, line);
  } catch {
    // swallow
  }
};

// length-prefixed read (Chrome native messaging)
const readOneChromeMessage = async (): Promise<any> => {
  const stdin = process.stdin;
  stdin.resume();

  // Read 4-byte header
  const headerBuf = Buffer.alloc(4);
  let headerRead = 0;
  while (headerRead < 4) {
    const chunk = stdin.read(4 - headerRead) as Buffer | null;
    if (chunk) {
      chunk.copy(headerBuf, headerRead);
      headerRead += chunk.length;
    } else {
      await new Promise<void>((r) => stdin.once('readable', r));
    }
  }
  const length = headerBuf.readUInt32LE(0);
  if (length <= 0 || length > MAX_MESSAGE_BYTES) {
    throw new Error(`Invalid message length: ${length}`);
  }

  const body = Buffer.alloc(length);
  let bodyRead = 0;
  while (bodyRead < length) {
    const chunk = stdin.read(length - bodyRead) as Buffer | null;
    if (chunk) {
      chunk.copy(body, bodyRead);
      bodyRead += chunk.length;
    } else {
      await new Promise<void>((r) => stdin.once('readable', r));
    }
  }

  try {
    const parsed = JSON.parse(body.toString('utf8'));
    return parsed;
  } catch (e) {
    throw new Error(`Invalid JSON payload from Chrome: ${(e as Error).message}`);
  }
};

// write length-prefixed response to stdout (protocol-only)
const writeChromeMessage = (obj: HostResponse): void => {
  const json = JSON.stringify(obj);
  const buf = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buf.length, 0);

  // MUST NOT write logs to stdout; only the protocol bytes
  try {
    process.stdout.write(header);
    process.stdout.write(buf);
  } catch {
    // nothing to do if stdout broken
  }
};

// validate incoming request shape (lightweight)
const validateRequest = (x: any): x is ExtractionRequest => {
  if (!x || typeof x !== 'object') return false;
  if (typeof x.id !== 'string') return false;
  if (typeof x.url !== 'string') return false;
  if (typeof x.text !== 'string') return false;
  if (typeof x.title !== 'string') return false;
  return true;
};

// Forward to electron with robust single-shot connect + response reading
const forwardToElectron = async (message: any): Promise<any> => {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let buffer = '';
    let settled = false;

    const cleanup = (): void => {
      try {
        client.destroy();
      } catch (e) {
        reject(new Error(`socket_destroy_error: ${(e as Error).message}`));
      }
    };

    const onError = (err: Error): void => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error(`app_not_running: ${(err as Error).message}`));
      }
    };

    client.setTimeout(ELECTRON_CONNECT_TIMEOUT);
    client.once('timeout', () => onError(new Error('connect_timeout')));
    client.once('error', onError);

    client.connect(IPC_PORT, '127.0.0.1', () => {
      // connected -> increase socket timeout for response
      client.setTimeout(ELECTRON_RESPONSE_TIMEOUT);
      client.removeAllListeners('timeout');
      client.on('timeout', () => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error('electron_response_timeout'));
        }
      });

      try {
        client.write(JSON.stringify(message) + '\n', 'utf8', (err) => {
          if (err) {
            onError(err);
          }
        });
      } catch (e) {
        onError(e as Error);
      }
    });

    client.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      // newline-delimited JSON messages (electron returns exactly one response followed by \n)
      if (buffer.indexOf('\n') !== -1) {
        const raw = buffer.slice(0, buffer.indexOf('\n')).trim();
        buffer = buffer.slice(buffer.indexOf('\n') + 1);
        try {
          const parsed = JSON.parse(raw);
          if (!settled) {
            settled = true;
            cleanup();
            resolve(parsed);
          }
        } catch (e) {
          if (!settled) {
            settled = true;
            cleanup();
            reject(new Error(`invalid_electron_response: ${(e as Error).message}`));
          }
        }
      }
    });

    client.once('close', () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('electron_closed'));
      }
    });
  });
};

// sanitize content to single-line and trim whitespace
function sanitizeContentToSingleLine(s: string): string {
  if (!s) return '';
  // Replace sequences of whitespace (including newlines) with single space,
  // then trim leading/trailing spaces.
  return s.replace(/\s+/g, ' ').trim();
}

// main loop: keep running and handling messages
const mainLoop = async (): Promise<void> => {
  await log('Native host started');
  process.stdin.resume();

  while (true) {
    let msg: any;
    try {
      msg = await readOneChromeMessage();
    } catch (err) {
      await log(`Read error: ${(err as Error).message}`);
      // Try to return a sensible error to Chrome if possible
      try {
        writeChromeMessage({ id: 'unknown', ok: false, reason: 'read_failed' });
      } catch {
        // If reading fails severely, exit to let Chrome reattempt later
      }
      process.exit(1);
    }

    if (!validateRequest(msg)) {
      await log('Invalid request shape: ' + JSON.stringify(msg).slice(0, 500));
      writeChromeMessage({ id: msg?.id || 'unknown', ok: false, reason: 'invalid_request' });
      continue;
    }

    await log(`Forwarding id=${msg.id} url=${msg.url.substring(0, 200)}`);

    try {
      const electronResp = await forwardToElectron(msg);
      // ensure we return id consistent with request
      const out: HostResponse = {
        id: msg.id,
        ok: !!electronResp.ok,
        reason: electronResp.ok ? undefined : electronResp.reason || 'electron_error',
        processed: null as any
      };

      if (electronResp.ok && electronResp.processed) {
        // sanitize content to single-line
        const contentRaw = electronResp.processed.content || '';
        out.processed = {
          url: electronResp.processed.url || msg.url,
          title: electronResp.processed.title || msg.title,
          content: sanitizeContentToSingleLine(String(contentRaw)),
          wordCount: electronResp.processed.wordCount,
          excerpt: sanitizeContentToSingleLine(
            String(electronResp.processed.excerpt || '').substring(0, 1000)
          ),
          byline: electronResp.processed.byline,
          readingTime: electronResp.processed.readingTime,
          savedId: electronResp.processed.savedId
        };
      }

      writeChromeMessage(out);
      await log(`Responded id=${msg.id} ok=${out.ok}`);
    } catch (err) {
      const reason = (err as Error).message || 'bridge_error';
      await log(`Bridge error for id=${msg.id}: ${reason}`);
      writeChromeMessage({ id: msg.id, ok: false, reason });
    }
  }
};

process.on('uncaughtException', async (e) => {
  await log('Uncaught: ' + (e as Error).stack);
  process.exit(1);
});

process.on('unhandledRejection', async (r) => {
  await log('Unhandled Rejection: ' + String(r));
  process.exit(1);
});

mainLoop().catch(async (err) => {
  await log('Fatal: ' + (err as Error).stack);
  process.exit(1);
});
