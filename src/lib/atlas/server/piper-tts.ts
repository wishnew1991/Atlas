import "server-only";

const POOL: Record<string, unknown> = {};

function isEdgeRuntime(): boolean {
  return process.env.NEXT_RUNTIME === "edge";
}

/**
 * Lazy-load Node-only modules. On Cloudflare Workers (edge) the module stays
 * untouched so the production bundle never pulls node:child_process / fs.
 */
async function loadNodeModules() {
  const { execFile } = await import("node:child_process");
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  POOL.execFile = execFile;
  POOL.readFile = readFile;
  POOL.join = join;
}

function requireNode<T>(key: string): T {
  const value = POOL[key];
  if (value === undefined) {
    throw new Error(`Node module "${key}" is unavailable on the edge runtime.`);
  }
  return value as T;
}

const VENV_PYTHON = ".mcp-venv/bin/python";
const VOICE_DIR = ".piper/voices";

const DEFAULT_VOICE = "en_US-lessac-medium";

function resolveVoice(voice: string): string {
  const clean = voice.trim() || DEFAULT_VOICE;
  // Guard against path traversal — voice names must be simple identifiers.
  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) return DEFAULT_VOICE;
  return clean;
}

function voiceFiles(voice: string): { model: string; config: string } {
  const join = requireNode<(...p: string[]) => string>("join");
  return {
    model: join(VOICE_DIR, `${voice}.onnx`),
    config: join(VOICE_DIR, `${voice}.onnx.json`),
  };
}

export async function isPiperAvailable(): Promise<boolean> {
  if (isEdgeRuntime()) return false;

  await loadNodeModules();
  const readFile = requireNode<(path: string) => Promise<unknown>>("readFile");
  try {
    const { model } = voiceFiles(DEFAULT_VOICE);
    await readFile(model);
    return true;
  } catch {
    return false;
  }
}

export interface PiperTtsOptions {
  voice?: string;
  lengthScale?: number;
}

/**
 * Synthesize speech with the local Piper TTS engine. Runs the piper-tts Python
 * module, writes the text to its stdin, and captures the WAV stream on stdout.
 * Throws when Piper or the voice model is unavailable, or on edge runtimes
 * where local subprocesses and files are not available.
 *
 * NOTE: execFile's `input` option does NOT pipe stdin to this subprocess —
 * Piper would wait for stdin EOF forever. We write + end() stdin manually.
 */
export function synthesizeSpeech(
  text: string,
  options: PiperTtsOptions = {}
): Promise<Buffer> {
  if (isEdgeRuntime()) {
    return Promise.reject(
      new Error("Piper TTS is not available on Cloudflare Workers.")
    );
  }

  return loadNodeModules().then(() => {
    const execFile = requireNode<Function>("execFile");
    const readFile = requireNode<(path: string) => Promise<unknown>>("readFile");

    return new Promise((resolve, reject) => {
      if (!text || !text.trim()) {
        reject(new Error("No text to synthesize."));
        return;
      }

      const voice = resolveVoice(options.voice ?? DEFAULT_VOICE);
      const { model, config } = voiceFiles(voice);

      Promise.all([readFile(model), readFile(config)])
        .then(() => {
          const args = [
            "-m",
            model,
            "-c",
            config,
            "-f",
            "-", // stdout
          ];

          if (options.lengthScale !== undefined) {
            args.push("--length-scale", String(options.lengthScale));
          }

          const execOptions = {
            maxBuffer: 25 * 1024 * 1024,
            // Critical: WAV is binary. Default utf8 decoding corrupts the stream
            // and browsers refuse to play the result (Test TTS / chat speak fail).
            encoding: "buffer" as const,
          };

          const child = (execFile as Function)(
            VENV_PYTHON,
            ["-m", "piper", ...args],
            execOptions,
            (error: unknown, stdout: unknown, code: unknown) => {
              if (error) {
                reject(new Error(`Piper TTS failed: ${(error as Error).message}`));
                return;
              }
              const audio = Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout));
              if (audio.length < 44 || audio.subarray(0, 4).toString("ascii") !== "RIFF") {
                reject(new Error("Piper returned invalid audio. Check the Piper install and voice model."));
                return;
              }
              resolve(audio);
            }
          );

          // Feed the text to Piper via stdin and close it so synthesis starts.
          child.stdin?.write(`${text.trim()}\n`);
          child.stdin?.end();
        })
        .catch(() => {
          reject(new Error(`Piper voice "${voice}" is not installed.`));
        });
    });
  });
}