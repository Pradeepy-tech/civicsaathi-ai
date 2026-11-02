import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import readline from 'readline';
import type { DuplicateCandidate } from '../types/civic.ts';
import {
  classifyCitizenComplaint as fallbackTsClassify,
  rankDuplicateCandidates as fallbackTsRankDuplicates,
  streamAskSaathiChat as fallbackTsStreamAskSaathi,
  transcribeCitizenAudio as fallbackTsTranscribe,
  type AskSaathiHistoryItem,
  type AskSaathiStreamEvent,
  type RawClassificationOutput,
} from './geminiService.ts';

export type { AskSaathiHistoryItem, AskSaathiStreamEvent, RawClassificationOutput };

interface WorkerMessage {
  id: string | null;
  event: 'ready' | 'result' | 'error' | 'delta' | 'notice';
  data?: unknown;
  error?: string;
  text?: string;
  message?: string;
}

interface PendingUnaryRequest {
  kind: 'unary';
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingStreamRequest {
  kind: 'stream';
  pushEvent: (ev: AskSaathiStreamEvent) => void;
  finish: () => void;
  fail: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type PendingEntry = PendingUnaryRequest | PendingStreamRequest;

class PythonAiWorkerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private pending = new Map<string, PendingEntry>();
  private reqCounter = 0;
  private spawnFailedPermanently = false;
  private bootStatus: Record<string, unknown> | null = null;

  constructor() {
    const shutdown = () => {
      if (this.child && !this.child.killed) {
        this.child.kill('SIGTERM');
      }
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    process.once('exit', shutdown);
  }

  private ensureWorker(): ChildProcessWithoutNullStreams {
    if (this.spawnFailedPermanently) {
      throw new Error('python3 runtime is unavailable on this host.');
    }
    if (this.child && !this.child.killed && this.child.exitCode === null) {
      return this.child;
    }

    const proc = spawn('python3', ['-u', '-m', 'ai_engine.worker'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child = proc;

    this.rl = readline.createInterface({
      input: proc.stdout,
      crlfDelay: Infinity,
    });

    this.rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed) as WorkerMessage;
        this.handleWorkerMessage(msg);
      } catch (err) {
        console.warn('[PythonAI] Ignored non-JSON stdout line:', trimmed.slice(0, 160), err);
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      const errText = chunk.toString('utf8').trim();
      if (errText) {
        console.warn('[PythonAI stderr]:', errText.slice(0, 400));
      }
    });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        this.spawnFailedPermanently = true;
      }
      this.failAllPending(new Error(`Python AI worker error: ${err.message}`));
      this.cleanupProcess();
    });

    proc.on('close', (code, signal) => {
      this.failAllPending(
        new Error(`Python AI worker exited unexpectedly (code=${code}, signal=${signal}).`)
      );
      this.cleanupProcess();
    });

    return proc;
  }

  private cleanupProcess(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    this.child = null;
  }

  private failAllPending(err: Error): void {
    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timer);
      if (entry.kind === 'unary') {
        entry.reject(err);
      } else {
        entry.fail(err);
      }
      this.pending.delete(id);
    }
  }

  private handleWorkerMessage(msg: WorkerMessage): void {
    if (msg.id === '__boot__' && msg.event === 'ready') {
      if (msg.data && typeof msg.data === 'object') {
        this.bootStatus = msg.data as Record<string, unknown>;
      }
      return;
    }

    if (!msg.id) return;
    const entry = this.pending.get(msg.id);
    if (!entry) return;

    if (entry.kind === 'unary') {
      clearTimeout(entry.timer);
      this.pending.delete(msg.id);
      if (msg.event === 'error') {
        entry.reject(new Error(msg.error || 'Python AI request failed.'));
      } else {
        entry.resolve(msg.data);
      }
      return;
    }

    // Stream request handling
    if (msg.event === 'notice') {
      entry.pushEvent({ type: 'notice', message: String(msg.message || '') });
    } else if (msg.event === 'delta') {
      entry.pushEvent({ type: 'delta', text: String(msg.text || '') });
    } else if (msg.event === 'result') {
      clearTimeout(entry.timer);
      this.pending.delete(msg.id);
      entry.finish();
    } else if (msg.event === 'error') {
      clearTimeout(entry.timer);
      this.pending.delete(msg.id);
      entry.fail(new Error(msg.error || 'Python AI stream failed.'));
    }
  }

  public isSpawnUnavailable(): boolean {
    return this.spawnFailedPermanently;
  }

  public getCachedBootStatus(): Record<string, unknown> | null {
    return this.bootStatus;
  }

  public callUnary<T>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 22_000
  ): Promise<T> {
    const proc = this.ensureWorker();
    const id = `py_${++this.reqCounter}_${Date.now()}`;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Python AI ${method} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pending.set(id, {
        kind: 'unary',
        resolve: (val) => resolve(val as T),
        reject,
        timer,
      });

      const payload = `${JSON.stringify({ id, method, params })}\n`;
      proc.stdin.write(payload, 'utf8', (writeErr) => {
        if (writeErr) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(writeErr);
        }
      });
    });
  }

  public async *callStream(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 25_000
  ): AsyncGenerator<AskSaathiStreamEvent, void, unknown> {
    const proc = this.ensureWorker();
    const id = `pystream_${++this.reqCounter}_${Date.now()}`;

    const queue: AskSaathiStreamEvent[] = [];
    let isDone = false;
    let streamErr: Error | null = null;
    let wakeNext: (() => void) | null = null;

    const notify = () => {
      if (wakeNext) {
        const fn = wakeNext;
        wakeNext = null;
        fn();
      }
    };

    const timer = setTimeout(() => {
      this.pending.delete(id);
      streamErr = new Error(`Python AI ${method} stream timed out after ${timeoutMs}ms.`);
      notify();
    }, timeoutMs);

    this.pending.set(id, {
      kind: 'stream',
      pushEvent: (ev) => {
        queue.push(ev);
        notify();
      },
      finish: () => {
        isDone = true;
        notify();
      },
      fail: (err) => {
        streamErr = err;
        notify();
      },
      timer,
    });

    const payload = `${JSON.stringify({ id, method, params })}\n`;
    proc.stdin.write(payload, 'utf8', (writeErr) => {
      if (writeErr) {
        clearTimeout(timer);
        this.pending.delete(id);
        streamErr = writeErr;
        notify();
      }
    });

    try {
      while (true) {
        while (queue.length > 0) {
          const nextEv = queue.shift()!;
          yield nextEv;
        }
        if (streamErr) {
          throw streamErr;
        }
        if (isDone) {
          break;
        }
        await new Promise<void>((resolve) => {
          wakeNext = resolve;
        });
      }
    } finally {
      clearTimeout(timer);
      this.pending.delete(id);
    }
  }
}

const pythonWorker = new PythonAiWorkerClient();

// Warm the Python worker process asynchronously when the server starts
void pythonWorker.callUnary('status', {}, 8_000).catch((err) => {
  console.warn('[PythonAI] Initial warm-up notice:', err instanceof Error ? err.message : err);
});

export async function getPythonAiEngineStatus(): Promise<Record<string, unknown>> {
  try {
    return await pythonWorker.callUnary<Record<string, unknown>>('status', {}, 6_000);
  } catch (err) {
    return (
      pythonWorker.getCachedBootStatus() || {
        engine: 'CivicSaathi AI Fallback Runtime',
        primaryLanguage: 'Python (unavailable on host)',
        detail: err instanceof Error ? err.message : String(err),
      }
    );
  }
}

export async function classifyCitizenComplaint(params: {
  description: string;
  languageCode: string;
  city: string;
  locality: string;
  followUpContext?: string;
}): Promise<RawClassificationOutput> {
  try {
    return await pythonWorker.callUnary<RawClassificationOutput>('classify', params, 22_000);
  } catch (err) {
    if (pythonWorker.isSpawnUnavailable()) {
      return fallbackTsClassify(params);
    }
    console.warn('[PythonAI] Retrying classification via backup bridge:', err);
    return fallbackTsClassify(params);
  }
}

export async function rankDuplicateCandidates(params: {
  locality: string;
  wardCode?: string;
  description: string;
  interpretedSummary: string;
  candidates: Array<{
    trackingCode: string;
    category: string;
    locality: string;
    wardCode: string;
    wardName: string;
    rawDescription: string;
    interpretedSummary: string;
    status: string;
    createdAt: string;
    duplicateOfTrackingCode: string | null;
  }>;
}): Promise<DuplicateCandidate[]> {
  try {
    return await pythonWorker.callUnary<DuplicateCandidate[]>('duplicates', params, 8_000);
  } catch (err) {
    if (!pythonWorker.isSpawnUnavailable()) {
      console.warn('[PythonAI] Duplicate ranking fallback:', err);
    }
    return fallbackTsRankDuplicates(params);
  }
}

export async function transcribeCitizenAudio(params: {
  base64Audio: string;
  mimeType: string;
  languageCode: string;
}): Promise<{ transcript: string }> {
  if (pythonWorker.isSpawnUnavailable()) {
    return fallbackTsTranscribe(params);
  }
  return pythonWorker.callUnary<{ transcript: string }>('transcribe', params, 28_000);
}

export async function* streamAskSaathiChat(
  messages: AskSaathiHistoryItem[]
): AsyncGenerator<AskSaathiStreamEvent, void, unknown> {
  if (pythonWorker.isSpawnUnavailable()) {
    yield* fallbackTsStreamAskSaathi(messages);
    return;
  }
  yield* pythonWorker.callStream('ask_saathi', { messages }, 26_000);
}
