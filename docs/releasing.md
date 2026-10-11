# Releases (Obtainium)

Pushing a `vX.Y.Z` tag runs `.github/workflows/release.yml`: tests, then a
signed release APK attached to a GitHub Release. Obtainium installs and
updates the app from those Releases.

One-time setup:

1. Create a release keystore and keep it (and its passwords) somewhere safe.
   Losing it means installed copies can never be updated again.

   ```bash
   keytool -genkeypair -v -keystore twenty-release.jks -alias twenty \
     -keyalg RSA -keysize 4096 -validity 10000
   ```

2. Add these repository secrets (Settings → Secrets and variables → Actions):
   - `ANDROID_KEYSTORE_BASE64`: output of `base64 -w0 twenty-release.jks`
   - `ANDROID_KEYSTORE_PASSWORD`: the keystore password
   - `ANDROID_KEY_ALIAS`: `twenty`
   - `ANDROID_KEY_PASSWORD`: the key password

3. In Obtainium, add the app with the repository's GitHub URL.

To release: bump `version` in `app.json`, commit, then

```bash
git tag v1.0.1 && git push origin main v1.0.1
```

The run fails if the tag does not match `app.json`. `versionCode` is derived
from the tag (`MAJOR*10000 + MINOR*100 + PATCH`), so minor and patch stay
0-99. Keep `android.package` (`com.local.twenty`) unchanged; changing it makes
Obtainium treat the app as a different one.

The APK is built for 64-bit ARM (`arm64-v8a`) only, which covers every
current phone and keeps the download small. It won't install on x86
emulators or old 32-bit phones; drop `-PreactNativeArchitectures=arm64-v8a`
from the workflow to build all four.
