// The signed-in check (DSK-26), runnable with plain Node, no Electron:
//
//   npm run check:claude -w @gurukul/desktop -- [--yes] [--claude <path>]
//
// Everything it does is in src/agent/signedInCheck.ts and src/agent/checkCli.ts, over the shipped
// agent code and the real Node adapters. It uses a few messages of the person's Claude plan and asks
// first. Never run it in CI or a container: tests use the fake claude in test/fixtures/.
import os from 'node:os';
import { checkClaudeMain } from '../src/agent/checkCli';
import { nodeAgentPlatform } from '../src/agent/node';

process.exitCode = await checkClaudeMain({
  argv: process.argv.slice(2),
  platform: nodeAgentPlatform(process.platform, process.env, os.homedir()),
  tempDir: os.tmpdir(),
  input: process.stdin,
  write: (text) => void process.stdout.write(text),
  system: `${process.platform} ${process.arch} (${os.release()}), Node ${process.version}`,
  date: new Date().toISOString().slice(0, 10),
  now: () => Date.now(),
});
// A `Continue?` answer leaves standard input open; nothing else is waiting.
process.stdin.unref?.();
