import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decision, runHook } from './helpers.mjs';

function bash(command) {
  return runHook('prod-guard', {
    session_id: 's',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
  });
}

describe('prod-guard', () => {
  it('asks before the Firebase CLI touches production', () => {
    for (const command of [
      'firebase firestore:delete --recursive /courses',
      'npx firebase auth:export users.json',
      'npx -y firebase-tools@latest functions:config:get',
      'npm exec -- firebase hosting:disable',
      './node_modules/.bin/firebase firestore:indexes',
      'firebase --project nonstop-gurukul functions:log',
      'firebase functions:log --project=default',
      'cd firebase && npx firebase firestore:delete -r /x',
      'FOO=1 firebase use nonstop-gurukul',
      'echo $(firebase projects:list)',
      'bash -c "bash -c \\"firebase auth:export u\\""',
      'xargs sh -c "firebase auth:export u" _',
      'bash <<< "firebase auth:export u"',
      'env -i firebase auth:export u',
      'sudo -u root firebase auth:export u',
      'time -p firebase auth:export u',
      'corepack pnpm dlx firebase-tools auth:export u',
      'npm x firebase auth:export u',
      'pnpm firebase auth:export u',
      '/bin/bash -c "firebase auth:export u"',
      'bash -c "firebase firestore:delete --all-collections"',
      "sh -c 'firebase auth:export u.json'",
      'zsh -lc "cd firebase && firebase auth:export u.json; echo done"',
      'sudo bash -c "firebase hosting:disable"',
      'bash -c \'bash -c "firebase auth:export u"\'',
      'eval "firebase auth:export u.json"',
      'echo users | xargs firebase firestore:delete -r',
      'echo x | xargs -I {} firebase firestore:delete {}',
      'echo x | xargs -n 1 -P 4 npx firebase auth:export',
      'pnpm dlx firebase-tools auth:export users.json',
      'pnpm exec firebase auth:export u.json',
      'bunx firebase-tools hosting:disable',
      'bun x firebase auth:export u.json',
      'pnpx firebase-tools auth:export u.json',
      'yarn firebase firestore:delete -r users',
      'yarn dlx -p firebase-tools firebase auth:export u.json',
    ]) {
      const out = decision(bash(command));
      assert.equal(out?.permissionDecision, 'ask', command);
      assert.equal(out.hookEventName, 'PreToolUse');
      assert.match(out.permissionDecisionReason, /nonstop-gurukul/, command);
    }
  });

  it('says why: the default project, or the project named', () => {
    assert.match(
      decision(bash('firebase auth:export u.json')).permissionDecisionReason,
      /No --project was given.*default project: nonstop-gurukul/,
    );
    assert.match(
      decision(bash('firebase firestore:delete -P some-other /x')).permissionDecisionReason,
      /--project some-other is not a demo-\* emulator project/,
    );
  });

  it('shows the command, truncated to 300 characters', () => {
    const long = `firebase firestore:delete /${'a'.repeat(400)}`;
    const reason = decision(bash(long)).permissionDecisionReason;
    assert.ok(reason.includes(`${long.slice(0, 300)}…`));
    assert.ok(!reason.includes(long));
  });

  it('lets the emulators, demo projects and local-only commands through silently', () => {
    for (const command of [
      'npm run emulators',
      'firebase emulators:start --project demo-gurukul',
      'npx firebase emulators:exec "npm test"',
      'firebase firestore:delete --project demo-gurukul /courses',
      'firebase --project=demo-gurukul auth:export x.json',
      'firebase --version',
      'npx firebase --help',
      'firebase login',
      'ls firebase/functions',
      'cat firebase.json',
      'git commit -m "docs: explain firebase emulators"',
      'npm run test:rules',
      'bash -c "firebase emulators:start"',
      'echo x | xargs firebase firestore:delete --project demo-gurukul',
      'pnpm dlx firebase-tools --version',
      'bash -c "ls firebase/functions"',
      'eval "echo firebase"',
      'command -v firebase',
      'sudo -u root ls',
      'bash <<< "ls firebase"',
      'bash -c "bash -c \\"firebase emulators:start\\""',
      'pnpm install',
      'yarn install',
      'pnpm exec vitest',
    ]) {
      const res = bash(command);
      assert.equal(res.status, 0, command);
      assert.equal(res.stdout, '', command);
    }
  });

  it('asks when the payload cannot be read, and is silent with no command', () => {
    const bad = runHook('prod-guard', 'garbage');
    assert.equal(bad.status, 0);
    assert.equal(decision(bad)?.permissionDecision, 'ask');
    assert.equal(runHook('prod-guard', { tool_input: {} }).stdout, '');
  });
});
