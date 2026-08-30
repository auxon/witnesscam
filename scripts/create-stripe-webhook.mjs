#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const setup = path.join(path.dirname(fileURLToPath(import.meta.url)), "setup-stripe.mjs");
const child = spawn(process.execPath, [setup], { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 1));
