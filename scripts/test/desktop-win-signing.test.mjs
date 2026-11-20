import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { SECRETS, VARIABLES, main, signing } from '../desktop-win-signing.mjs';
import { SCRIPTS, tempDir } from './helpers.mjs';

const ALL = {
  AZURE_TENANT_ID: '00000000-0000-0000-0000-000000000001',
  AZURE_CLIENT_ID: '00000000-0000-0000-0000-000000000002',
  AZURE_CLIENT_SECRET: 'not-a-real-secret',
  WIN_SIGN_ENDPOINT: 'https://eus.codesigning.azure.net/',
  WIN_SIGN_ACCOUNT: 'gurukul-signing',
  WIN_SIGN_PROFILE: 'gurukul-studio',
  WIN_SIGN_PUBLISHER: 'Example Learning Pvt Ltd',
};

function run(args, env) {
  const out = [];
  const code = main(args, env, (text) => out.push(text));
  return { code, out: out.join('') };
}

describe('signing', () => {
  it('leaves the installer unsigned when nothing is set, or only blanks', () => {
    assert.deepEqual(signing({}), { signed: false });
    assert.deepEqual(signing({ AZURE_CLIENT_SECRET: '', WIN_SIGN_ENDPOINT: '  ' }), {
      signed: false,
    });
  });

  it('signs with every setting, passing them as electron-builder flags', () => {
    assert.deepEqual(signing(ALL), {
      signed: true,
      publisher: 'Example Learning Pvt Ltd',
      args: [
        '-c.win.azureSignOptions.endpoint=https://eus.codesigning.azure.net/',
        '-c.win.azureSignOptions.codeSigningAccountName=gurukul-signing',
        '-c.win.azureSignOptions.certificateProfileName=gurukul-studio',
        '-c.win.azureSignOptions.publisherName=Example Learning Pvt Ltd',
      ],
    });
  });

  it('refuses half a setup, naming each missing setting', () => {
    for (const name of [...SECRETS, ...VARIABLES]) {
      const result = signing({ ...ALL, [name]: '' });
      assert.match(result.error, new RegExp(`missing: ${name} \\(`));
    }
    assert.match(
      signing({ WIN_SIGN_PUBLISHER: 'x' }).error,
      /missing: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, WIN_SIGN_ENDPOINT, WIN_SIGN_ACCOUNT, WIN_SIGN_PROFILE/,
    );
  });

  it('refuses an endpoint that is not Trusted Signing’s, and a value with a line break', () => {
    for (const endpoint of [
      'http://eus.codesigning.azure.net/',
      'https://eus.codesigning.azure.net.example.com/',
      'https://example.com/',
    ]) {
      assert.match(signing({ ...ALL, WIN_SIGN_ENDPOINT: endpoint }).error, /WIN_SIGN_ENDPOINT/);
    }
    assert.equal(
      signing({ ...ALL, WIN_SIGN_ENDPOINT: 'https://weu.codesigning.azure.net' }).signed,
      true,
    );
    assert.equal(
      signing({ ...ALL, WIN_SIGN_PROFILE: 'a\n-c.win.publisherName=x' }).error,
      'WIN_SIGN_PROFILE holds a line break',
    );
  });
});

describe('main', () => {
  it('says unsigned, writes signed=false and prints no flags', () => {
    const dir = tempDir('win-signing');
    try {
      const output = path.join(dir, 'out');
      const checked = run([], { GITHUB_OUTPUT: output });
      assert.equal(checked.code, 0);
      assert.match(
        checked.out,
        /::notice::Windows signing is not set up: the installer is unsigned/,
      );
      assert.equal(readFileSync(output, 'utf8'), 'signed=false\n');
      assert.deepEqual(run(['--args'], {}), { code: 0, out: '' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('says signed, names the publisher, never prints a secret', () => {
    const dir = tempDir('win-signing');
    try {
      const output = path.join(dir, 'out');
      const checked = run([], { ...ALL, GITHUB_OUTPUT: output });
      assert.equal(checked.code, 0);
      assert.match(checked.out, /signed with Azure Trusted Signing as Example Learning Pvt Ltd/);
      assert.equal(readFileSync(output, 'utf8'), 'signed=true\n');
      const flags = run(['--args'], ALL);
      assert.equal(flags.out.split('\n').length, 5);
      for (const out of [checked.out, flags.out]) {
        assert.ok(!out.includes(ALL.AZURE_CLIENT_SECRET));
        assert.ok(!out.includes(ALL.AZURE_CLIENT_ID));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails half a setup in both modes, and prints without GITHUB_OUTPUT', () => {
    const half = { ...ALL, AZURE_CLIENT_SECRET: '' };
    assert.equal(run([], half).code, 1);
    assert.match(run(['--args'], half).out, /^::error::Windows signing is half set up/);
    assert.equal(run([], ALL).code, 0);
  });

  it('runs as a program', () => {
    const script = path.join(SCRIPTS, 'desktop-win-signing.mjs');
    const env = { PATH: process.env.PATH, ...ALL };
    const res = spawnSync(process.execPath, [script, '--args'], { encoding: 'utf8', env });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /publisherName=Example Learning Pvt Ltd\n$/);
    const bad = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, WIN_SIGN_ACCOUNT: 'x' },
    });
    assert.equal(bad.status, 1);
  });
});
