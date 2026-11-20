// A `claude` that starts and answers `initialize`, then never says another word: for the signed-in
// check's failure paths (test/agent/signedInCheck.test.ts). Steered, like fake-claude.mjs, by a
// file in `CLAUDE_CONFIG_DIR`, the one variable of its own the allow-list lets through:
//
//   $CLAUDE_CONFIG_DIR/silent-claude.json
//     { "version": "<what --version prints>", "auth": "<what auth status prints>",
//       "failStart": true,        a session start exits 1 at once
//       "failResume": true,       a --resume start exits 1 at once
//       "noAccount": true,        `initialize` answers with no `account`, so no tokenSource
//       "stuckTranscript": true } makes `projects/silent/<id>.jsonl` a folder, which forget cannot remove
// It never calls Anthropic.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const argv = process.argv.slice(2);
const config = process.env.CLAUDE_CONFIG_DIR ?? '.';
const modeFile = path.join(config, 'silent-claude.json');
const mode = existsSync(modeFile) ? JSON.parse(readFileSync(modeFile, 'utf8')) : {};

if (argv[0] === '--version') {
  process.stdout.write(mode.version ?? '2.1.330 (Claude Code)\n');
  process.exit(0);
}
if (argv[0] === 'auth') {
  process.stdout.write(mode.auth ?? '{"loggedIn":true,"authMethod":"claude.ai"}\n');
  process.exit(0);
}
const resuming = argv.includes('--resume');
if (mode.failStart || (resuming && mode.failResume)) process.exit(1);
if (!resuming && mode.stuckTranscript) {
  const id = argv[argv.indexOf('--session-id') + 1];
  mkdirSync(path.join(config, 'projects', 'silent', `${id}.jsonl`), { recursive: true });
}

readline
  .createInterface({ input: process.stdin })
  .on('line', (line) => {
    const msg = JSON.parse(line);
    if (msg.type === 'control_request' && msg.request.subtype === 'initialize') {
      const response = mode.noAccount ? {} : { account: { tokenSource: 'claude.ai' } };
      const answer = { subtype: 'success', request_id: msg.request_id, response };
      process.stdout.write(`${JSON.stringify({ type: 'control_response', response: answer })}\n`);
    }
  })
  .on('close', () => process.exit(0));
