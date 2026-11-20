#!/usr/bin/env node
// Windows signing for Gurukul Studio's installer (DSK-22), for .github/workflows/desktop-release.yml.
// Signing is Azure Trusted Signing through electron-builder's `win.azureSignOptions`
// (docs/desktop-release-setup.md, "Windows signing"; .plan/22-desktop-studio.md, "As built in
// DSK-22"). It turns on only when every setting below is there:
//
//   secrets    AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (an app registration with the
//              Trusted Signing Certificate Profile Signer role; read by Microsoft's TrustedSigning
//              PowerShell module, never by this script beyond "is it set")
//   variables  WIN_SIGN_ENDPOINT   https://<region>.codesigning.azure.net/
//              WIN_SIGN_ACCOUNT    the Trusted Signing account name
//              WIN_SIGN_PROFILE    its certificate profile name
//              WIN_SIGN_PUBLISHER  the certificate's subject name (the validated organisation),
//                                  which installed apps check every later update against
//
// None set: the installer is unsigned, as before DSK-22, and the build goes on. All set: signed.
// Some set: the build fails, naming what is missing, rather than ship unsigned by mistake.
//
// Usage:
//   node scripts/desktop-win-signing.mjs          says which, and writes `signed=true|false` to
//                                                 $GITHUB_OUTPUT when it is set; exit 1 when some
//                                                 are missing or one is malformed
//   node scripts/desktop-win-signing.mjs --args   prints electron-builder's -c flags, one per line
//                                                 (nothing when unsigned)
// It never prints a secret.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SECRETS = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'];
export const VARIABLES = [
  'WIN_SIGN_ENDPOINT',
  'WIN_SIGN_ACCOUNT',
  'WIN_SIGN_PROFILE',
  'WIN_SIGN_PUBLISHER',
];
const ENDPOINT = /^https:\/\/[a-z0-9-]+\.codesigning\.azure\.net\/?$/;

/**
 * What the environment asks for: `{ signed: false }`, `{ signed: true, args }` with
 * electron-builder's flags, or `{ error }` saying what is wrong.
 */
export function signing(env) {
  const names = [...SECRETS, ...VARIABLES];
  const value = (name) => (env[name] ?? '').trim();
  const missing = names.filter((name) => value(name) === '');
  if (missing.length === names.length) return { signed: false };
  if (missing.length > 0) {
    return {
      error: `Windows signing is half set up; missing: ${missing.join(', ')} (docs/desktop-release-setup.md, Windows signing)`,
    };
  }
  const endpoint = value('WIN_SIGN_ENDPOINT');
  if (!ENDPOINT.test(endpoint)) {
    return { error: 'WIN_SIGN_ENDPOINT is not https://<region>.codesigning.azure.net/' };
  }
  const multiline = VARIABLES.find((name) => /[\r\n]/.test(value(name)));
  if (multiline !== undefined) return { error: `${multiline} holds a line break` };
  return {
    signed: true,
    publisher: value('WIN_SIGN_PUBLISHER'),
    args: [
      `-c.win.azureSignOptions.endpoint=${endpoint}`,
      `-c.win.azureSignOptions.codeSigningAccountName=${value('WIN_SIGN_ACCOUNT')}`,
      `-c.win.azureSignOptions.certificateProfileName=${value('WIN_SIGN_PROFILE')}`,
      `-c.win.azureSignOptions.publisherName=${value('WIN_SIGN_PUBLISHER')}`,
    ],
  };
}

/** Runs as the workflow does; returns the exit code. */
export function main(argv, env, write = (text) => process.stdout.write(text)) {
  const result = signing(env);
  if ('error' in result) {
    write(`::error::${result.error}\n`);
    return 1;
  }
  if (argv.includes('--args')) {
    if (result.signed) write(`${result.args.join('\n')}\n`);
    return 0;
  }
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `signed=${result.signed}\n`);
  write(
    result.signed
      ? `::notice::The Windows installer is signed with Azure Trusted Signing as ${result.publisher}\n`
      : '::notice::Windows signing is not set up: the installer is unsigned and SmartScreen warns on first run\n',
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2), process.env);
}
