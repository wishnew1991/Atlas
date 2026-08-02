import "server-only";

import { execFile, type ExecFileOptions } from "child_process";
import { readFile } from "fs/promises";
import { join } from "path";

const VENV_PYTHON = join(process.cwd(), ".mcp-venv", "bin", "python");
const VOICE_DIR = join(process.cwd(), ".piper", "voices");

const DEFAULT_VOICE = "en_US-lessac-medium";

function resolveVoice(voice: string): string {
  const clean = voice.trim() || DEFAULT_VOICE;
  // Guard against path traversal — voice names must be simple identifiers.
  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) return DEFAULT_VOICE;
  return clean;
}

function voiceFiles(voice: string): { model: string; config: string } {
  return {
    model: join(VOICE_DIR, `${voice}.onnx`),
    config: join(VOICE_DIR, `${voice}.onnx.json`),
  };
}

export async function isPiperAvailable(): Promise<boolean> {
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
 * Throws when Piper or the voice model is unavailable.
 *
 * NOTE: execFile's `input` option does NOT pipe stdin to this subprocess —
 * Piper would wait for stdin EOF forever. We write + end() stdin manually.
 */
export function synthesizeSpeech(
  text: string,
  options: PiperTtsOptions = {}
): Promise<Buffer> {
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

        const execOptions: ExecFileOptions = { maxBuffer: 25 * 1024 * 1024 };
        const child = execFile(VENV_PYTHON, ["-m", "piper", ...args], execOptions, (error, stdout) => {
          if (error) {
            reject(new Error(`Piper TTS failed: ${error.message}`));
            return;
          }
          resolve(Buffer.from(stdout));
        });

        // Feed the text to Piper via stdin and close it so synthesis starts.
        child.stdin?.write(text);
        child.stdin?.end();
      })
      .catch(() => {
        reject(new Error(`Piper voice "${voice}" is not installed.`));
      });
  });
}
