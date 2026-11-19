# Set up signed releases of Gurukul Studio

Gurukul Studio, the desktop app (`apps/desktop`), is released through GitHub Releases of
`nonstopio/gurukul` by `.github/workflows/desktop-release.yml`. The macOS build is signed with an
Apple Developer ID and notarised, so it opens on any Mac without a warning; it is not submitted to
the Mac App Store. The Windows build is unsigned until a Windows certificate is bought (`DSK-22`),
so Windows shows a SmartScreen warning on the first run.

This guide is adapted from Morph's `docs/release-setup.md`. The design is in
`.plan/22-desktop-studio.md` (Releases, versions and updates).

## How a release happens

Nobody types a version and nobody presses a button:

1. A pull request that touches `apps/desktop/` is squash-merged into `main`. Its title is the commit
   subject, so it decides the bump: `feat(desktop)!: …` or a `BREAKING CHANGE:` line is major,
   `feat(desktop): …` is minor, anything else is patch.
2. CI passes on that commit. Only then does **Desktop release** start (as **Deploy** waits for CI).
3. `scripts/desktop-version.mjs` finds the last `desktop-v*` tag and reads the commits since it that
   touched `apps/desktop/`. None: nothing is released. With no tag yet, the first release is
   `desktop-v0.1.0`.
4. The macOS (Apple Silicon and Intel, DMG and ZIP) and Windows (x64 installer) builds run, with the
   version stamped into the build and never committed.
5. One GitHub Release, `desktop-vX.Y.Z`, is created with the installers, `latest-mac.yml`,
   `latest.yml` and the blockmaps, and notes from the merged pull requests. The installed apps
   find it within six hours (or at once from **Check for updates…**).

A change only to the web app releases nothing here: the desktop app loads the live site, so it gets
that change with the normal deploy. The web deploy creates `release-*` tags but never a GitHub
Release, which keeps the latest release a desktop one; the updater depends on that.

## 1. Confirm the Apple membership and Team ID

Sign in at https://developer.apple.com/account/. Confirm the Apple Developer Program membership is
active and accept any outstanding agreements. Open **Membership details**, copy the **Team ID**, and
keep it for `APPLE_TEAM_ID`. The Apple account email of this membership is `APPLE_ID`.

Source: https://developer.apple.com/help/glossary/team-id/

## 2. Reuse a Developer ID certificate, or create one

A valid **Developer ID Application** certificate with its private key can be reused: the one Morph
is signed with works for Gurukul Studio too, because the certificate names the team, not the app.
If you have it in Keychain Access on your Mac (**login → My Certificates**, named
`Developer ID Application: Your Name (TEAMID)` with a private key under it), skip to step 4.

Otherwise, create one:

1. Open **Keychain Access** and choose **Keychain Access → Certificate Assistant → Request a
   Certificate from a Certificate Authority**.
2. Enter the Apple account email, a recognisable **Common Name** such as
   `Gurukul Studio Release Signing`, leave **CA Email Address** blank, choose **Saved to disk**,
   and save the `.certSigningRequest` outside this repository.
3. In the developer account, open **Certificates, Identifiers & Profiles → Certificates**, click
   **+**, choose **Developer ID Application**, and upload the request.
4. Download the `.cer`, double-click it to import it on the same Mac, and confirm a private key
   appears under it in **My Certificates**.

Sources: https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request
and https://developer.apple.com/help/account/certificates/create-developer-id-certificates

## 3. No App ID or profile to register

Developer ID apps need no App ID or provisioning profile. The app id `com.nonstopio.gurukul.studio`
is set in `apps/desktop/electron-builder.yml` and needs no registration.

## 4. Export the certificate and private key

1. Select the certificate in **My Certificates** and choose **File → Export Items**.
2. Choose **Personal Information Exchange (.p12)** and save it as `Gurukul-Developer-ID.p12`
   outside the repository, for example in Downloads. (`*.p12` is in `.gitignore`, but keep it out
   of the folder anyway.)
3. Set a strong export password and keep it in the password manager. It becomes
   `CSC_KEY_PASSWORD`. macOS may ask for the login keychain password separately.
4. Copy a base64 encoding of the export straight to the clipboard, without printing it:

   ```sh
   base64 -i "$HOME/Downloads/Gurukul-Developer-ID.p12" | tr -d '\n' | pbcopy
   ```

   This is `CSC_LINK`. If `.p12` is not offered, the selected item has no private key: pick the
   certificate on the Mac that made the request.

Keep the `.p12` and its password private, with a secure backup.

## 5. Generate an app-specific password

1. Sign in at https://account.apple.com/ with the same Apple account.
2. Open **Sign-In and Security → App-Specific Passwords** and generate one labelled
   `Gurukul GitHub Notarisation`.
3. It becomes `APPLE_APP_SPECIFIC_PASSWORD`. Two-factor authentication must be on. Changing the
   Apple account password revokes app-specific passwords: generate a new one and update the secret.

Source: https://support.apple.com/en-us/102654

## 6. Add the five GitHub Actions secrets

Open https://github.com/nonstopio/gurukul/settings/secrets/actions. For each row, click **New
repository secret**, enter the exact name, paste the value, and click **Add secret**.

| Name                          | Value                                                                  |
| ----------------------------- | ---------------------------------------------------------------------- |
| `CSC_LINK`                    | Single-line base64 of the `.p12` (certificate and private key), step 4 |
| `CSC_KEY_PASSWORD`            | The `.p12` export password, step 4                                     |
| `APPLE_ID`                    | The Apple account email, step 1                                        |
| `APPLE_APP_SPECIFIC_PASSWORD` | The app-specific password, step 5                                      |
| `APPLE_TEAM_ID`               | The Team ID, step 1                                                    |

Use repository **Secrets**, not Variables, and not the `production` environment (that one holds the
Firebase deploy key). Never paste these values into chat, issues, pull requests, source files or
logs. `GITHUB_TOKEN` is GitHub's own; no other token is needed.

The workflow checks all five by name before building and stops with
`Missing required macOS release secret: <name>` if one is absent. It also builds with
`forceCodeSigning`, so an unsigned Mac build can never be published.

Source: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets

## 7. Release and verify

Add the secrets before merging a pull request that touches `apps/desktop/`; without them the macOS
build fails and nothing is published.

1. In GitHub Actions, open **Desktop release** for the merge. **Next version** names the tag; the
   macOS build must finish signing and notarising; **Create release** lists the files.
2. On https://github.com/nonstopio/gurukul/releases, the new release must hold both DMGs and ZIPs
   (`Gurukul-Studio-X.Y.Z-arm64` and `-x64`), `Gurukul-Studio-Setup-X.Y.Z.exe`, `latest-mac.yml`,
   `latest.yml` and the `.blockmap` files, and be marked **Latest**.
3. Download the DMG in a browser, drag Gurukul Studio to Applications and open it normally, without
   removing the quarantine flag by hand. It must open with no "cannot be opened" warning.
4. Check the signature, Gatekeeper's verdict and the stapled ticket:

   ```sh
   codesign --verify --deep --strict --verbose=2 "/Applications/Gurukul Studio.app"
   spctl --assess --type execute --verbose=4 "/Applications/Gurukul Studio.app"
   xcrun stapler validate "/Applications/Gurukul Studio.app"
   ```

5. Check the Electron fuses (`RunAsNode` off, asar integrity on):

   ```sh
   npx @electron/fuses read --app "/Applications/Gurukul Studio.app"
   ```

## 8. The upgrade check, by hand, between two releases

Unit tests cover the updater's decisions; only two real signed releases prove the signing,
notarisation and update files work together. Run this for the first release that has the updater,
and again whenever the build or signing setup changes. The first updater-enabled version has to be
installed by hand; every later one arrives by itself.

1. Install the older release (step 7). Sign in, open Studio, and start a session if sessions exist
   in that version, so there is work to keep.
2. Merge a change to `apps/desktop/` so the newer release is published.
3. In the older app choose **Gurukul Studio → Check for updates…** (Windows: **Help → Check for
   updates…**). It says the new version is downloading, or is ready.
4. When it is ready, the sidebar shows **Update ready**. Quit nothing yet: confirm the app keeps
   working with the item there.
5. Choose **Update ready**. The app restarts into the new version. Confirm the version (macOS: **Gurukul
   Studio → About Gurukul Studio**; Windows: **Settings → Apps → Installed apps**) and that the open session and the sign-in survived.
6. Repeat on an Apple Silicon Mac, an Intel Mac and a Windows PC. On Windows, also try the other
   path: with an update ready, quit the app and start it again; it must start in the new version.

Record the result (versions, machines, what was checked) in the pull request that closes `DSK-21`.

## When something goes wrong

- **A secret is missing or wrong**: the macOS job says which, or electron-builder fails at signing
  (`CSC_LINK`, `CSC_KEY_PASSWORD`) or at notarisation (the `APPLE_*` three). Fix the secret and
  re-run the failed jobs; the version and tag are recomputed from the same commit.
- **A release went out broken**: publish a fixed one with a new merge. Never delete a release that
  installed apps may already have downloaded; a newer version replaces it.
- **No release appeared**: the merge touched nothing under `apps/desktop/`, or CI failed on it.
  **Next version** says which in its notice.
