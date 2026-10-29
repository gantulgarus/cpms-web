// TypeScript retains @/ aliases in emitted CommonJS. Resolve them in the output tree.
import Module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../.verify-mock", import.meta.url));
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith("@/") ? path.join(root, name.slice(2)) : name, ...args);
};
const script = process.argv[2];
if (!["verify-mock", "verify-my-work", "verify-site-engineers"].includes(script)) throw new Error("Unknown verification script");
await import(pathToFileURL(path.join(root, "scripts", `${script}.js`)).href);
