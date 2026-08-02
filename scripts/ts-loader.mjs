// Minimal Node ESM loader so the trace scripts can import the app's TypeScript
// modules directly: resolves the "@/..." path alias, adds extensionless
// specifiers, strips `server-only`, and transpiles TS on the fly.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import ts from "typescript";

const projectRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: pathToFileURL(resolvePath(projectRoot, "scripts/empty-module.mjs")).href, shortCircuit: true };
  }

  let base = null;

  if (specifier.startsWith("@/")) {
    base = resolvePath(projectRoot, "src", specifier.slice(2));
  } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
  }

  if (base) {
    for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base]) {
      try {
        readFileSync(candidate);
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      } catch {
        /* try next */
      }
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: fileURLToPath(url),
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }

  return nextLoad(url, context);
}
