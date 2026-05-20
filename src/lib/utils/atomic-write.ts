/**
 * Atomare Datei-Writes via tmp + rename.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function atomicWrite(filePath: string, contents: string | Buffer): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
}
