import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

/**
 * Razzberry iOS app. Separate from Uniq Group (`ca.uniquem.app`).
 * Apple App ID 28F8KU46QW, team 3CW838WDQC. The committed project is not
 * pre-signed; CI applies the Razzberry App Store profile only for archives.
 */
export const IOS_BUNDLE_ID = "ca.razzberry.app";

const config: CapacitorConfig = {
  appId: IOS_BUNDLE_ID,
  appName: "Razzberry",
  webDir: "dist",
  ios: {
    // Full-bleed WKWebView. CSS env(safe-area-inset-*) pads controls.
    contentInset: "never",
    backgroundColor: "#07060a",
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Native,
      resizeOnFullScreen: true,
    },
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
      backgroundColor: "#07060a",
    },
  },
  server: {
    // https://localhost is the WKWebView origin. Firebase Auth will reject sign-in
    // until `localhost` is an authorized domain. The sample demo does not need that.
    iosScheme: "https",
    androidScheme: "https",
    hostname: "localhost",
  },
};

export default config;
