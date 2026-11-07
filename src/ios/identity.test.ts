import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IOS_BUNDLE_ID } from "../../capacitor.config";

const FORBIDDEN_BUNDLE = "ca.uniquem.app";
const TEAM = "3CW838WDQC";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("iOS identity", () => {
  it("uses the registered Razzberry bundle id and not the other app", () => {
    expect(IOS_BUNDLE_ID).toBe("ca.razzberry.app");
    const config = read("../../capacitor.config.ts");
    const project = read("../../ios/App/App.xcodeproj/project.pbxproj");
    expect(config).toContain(`export const IOS_BUNDLE_ID = "${IOS_BUNDLE_ID}"`);
    expect(config).not.toMatch(/appId:\s*["']ca\.uniquem\.app["']/);
    expect(project).toContain(`PRODUCT_BUNDLE_IDENTIFIER = ${IOS_BUNDLE_ID};`);
    expect(project).not.toContain(FORBIDDEN_BUNDLE);
  });

  it("keeps the distribution team and profile out of the committed project", () => {
    const project = read("../../ios/App/App.xcodeproj/project.pbxproj");
    expect(project).not.toContain(`DEVELOPMENT_TEAM = ${TEAM}`);
    expect(project).not.toContain("PROVISIONING_PROFILE");
    expect(project).not.toContain("Razzberry App Store");
  });

  it("declares production push so the App Store profile matches, without a push client", () => {
    const entitlements = read("../../ios/App/App/App.entitlements");
    const delegate = read("../../ios/App/App/AppDelegate.swift");
    expect(entitlements).toContain("<string>production</string>");
    expect(entitlements).not.toContain(FORBIDDEN_BUNDLE);
    expect(delegate).not.toContain("registerForRemoteNotifications");
    expect(delegate).not.toContain("UNUserNotificationCenter");
  });

  it("asks for location only for the existing check-in", () => {
    const plist = read("../../ios/App/App/Info.plist");
    expect(plist).toContain("CFBundleDisplayName");
    expect(plist).toContain("Razzberry");
    expect(plist).toContain("NSLocationWhenInUseUsageDescription");
    expect(plist).not.toContain("NSMicrophoneUsageDescription");
    expect(plist).not.toContain(FORBIDDEN_BUNDLE);
  });
});

describe("iOS workflow", () => {
  const workflow = read("../../.github/workflows/ios.yml");
  const archive = read("../../scripts/ios/archive.sh");

  it("compiles on the hosted macOS 26 runner and archives with the six named secrets", () => {
    expect(workflow).toContain("runs-on: macos-26");
    expect(workflow).toContain("CODE_SIGNING_ALLOWED=NO");
    for (const name of ["IOS_DIST_P12", "IOS_DIST_P12_PASSWORD", "IOS_APPSTORE_PROFILE", "ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8"]) {
      expect(workflow).toContain(name);
      expect(archive).toContain(name);
    }
    expect(archive).toContain("Razzberry App Store");
    expect(archive).toContain("78e76fb8-4d32-44f1-8693-3d63f9c8e263");
    expect(archive).toContain("ca.razzberry.app");
    expect(archive).not.toContain("altool");
    expect(archive).not.toContain("iTMSTransporter");
    expect(workflow).toContain("6832082405");
    expect(workflow).toContain("testflight-upload");
    expect(workflow).not.toContain("submit-for-review");
    const upload = read("../../.github/workflows/ios-testflight.yml");
    expect(upload).toContain("workflow_dispatch");
    expect(upload).toContain("6832082405");
    expect(upload).toContain("testflight-only");
    expect(upload).not.toContain("submit-for-review");
    expect(read("../../scripts/ios/upload_testflight.py").toLowerCase()).toContain("does not submit for review");
  });
});
