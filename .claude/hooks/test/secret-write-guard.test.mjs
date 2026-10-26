import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decision, runHook } from './helpers.mjs';

// Every sample is assembled at runtime, so this file never contains a string that a secret
// scanner (or this very hook, when someone edits the file) would mistake for a real credential.
const pem = ['-----BEGIN', 'PRIVATE KEY-----\nMIIE\n-----END', 'PRIVATE KEY-----'].join(' ');
const rsaPem = ['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' ');
const serviceAccount = JSON.stringify({
  type: ['service', 'account'].join('_'),
  project_id: 'example',
  [['private', 'key'].join('_')]: 'redacted',
});
const github = `gh${'p'}_${'a1B2'.repeat(9)}`;
const githubPat = `github${'_pat'}_${'A'.repeat(30)}`;
const aws = `AK${'IA'}${'ABCDEFGHIJKLMNOP'}`;
const slack = `xo${'xb'}-${'1234567890'}-abcdef`;
const firebaseWebKey = `AI${'za'}Sy${'A'.repeat(33)}`;

function write(file_path, content, tool = 'Write') {
  return runHook('secret-write-guard', {
    session_id: 's',
    hook_event_name: 'PreToolUse',
    tool_name: tool,
    tool_input: { file_path, content },
  });
}

describe('secret-write-guard', () => {
  it('asks before writing content that looks like a secret', () => {
    for (const [label, content] of [
      ['PEM private key', pem],
      ['PEM private key', rsaPem],
      ['service-account key', serviceAccount],
      ['GitHub token', github],
      ['GitHub token', githubPat],
      ['AWS access key', aws],
      ['Slack token', slack],
    ]) {
      const out = decision(write('/repo/apps/web/src/config.ts', `const x = '${content}';`));
      assert.equal(out?.permissionDecision, 'ask', label);
      assert.match(out.permissionDecisionReason, new RegExp(label.split(' ')[0], 'i'));
      assert.match(out.permissionDecisionReason, /open source/);
      assert.match(out.permissionDecisionReason, /GitHub Actions secrets/);
      assert.match(out.permissionDecisionReason, /\.env\.local/);
      assert.ok(!out.permissionDecisionReason.includes(content), 'never echoes the value');
    }
  });

  it('inspects Edit new_string and every MultiEdit edit', () => {
    const edit = runHook('secret-write-guard', {
      tool_name: 'Edit',
      tool_input: { file_path: '/repo/a.ts', old_string: 'x', new_string: github },
    });
    assert.equal(decision(edit)?.permissionDecision, 'ask');

    const multi = runHook('secret-write-guard', {
      tool_name: 'MultiEdit',
      tool_input: {
        file_path: '/repo/a.ts',
        edits: [
          { old_string: 'a', new_string: 'fine' },
          { old_string: 'b', new_string: aws },
        ],
      },
    });
    assert.equal(decision(multi)?.permissionDecision, 'ask');
  });

  it('asks before writing an env file or a service-account file', () => {
    for (const file of [
      '/repo/.env',
      '/repo/apps/web/.env.local',
      '/repo/.env.production',
      '/repo/service-account.json',
      '/repo/ci/gurukul-service-account-key.json',
      '/repo/nonstop-gurukul-firebase-adminsdk-abc.json',
    ]) {
      const out = decision(write(file, 'NOTHING_SECRET=1'));
      assert.equal(out?.permissionDecision, 'ask', file);
    }
  });

  it('lets .env.example, ordinary code and the public Firebase web apiKey through', () => {
    for (const [file, content] of [
      ['/repo/apps/web/.env.example', 'VITE_FIREBASE_API_KEY=\n'],
      ['/repo/apps/web/src/firebase.ts', `export const apiKey = '${firebaseWebKey}';`],
      ['/repo/README.md', 'Tokens start with ghp_ and private keys with -----BEGIN.'],
      ['/repo/apps/web/src/env.ts', 'const service = "service_account";'],
    ]) {
      const res = write(file, content);
      assert.equal(res.status, 0);
      assert.equal(res.stdout, '', file);
    }
  });

  it('fails open on an unreadable payload', () => {
    const res = runHook('secret-write-guard', '{{{');
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '');
  });
});
