import UIKit
import Capacitor
import WebKit

/// One bridge for the packaged page. Logs JS errors and writes a WKWebView snapshot the simulator job can read.
class RazzberryBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private var capturedReadyFrame = false

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let controller = webView?.configuration.userContentController else { return }
        controller.add(self, name: "razzberry")
        let source = """
        (function () {
          function send(body) {
            try {
              var hook = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.razzberry;
              if (hook) hook.postMessage(String(body).slice(0, 400));
            } catch (e) {}
          }
          window.addEventListener("error", function (event) {
            var target = event.target;
            var detail = target && target !== window && target.src ? "load " + target.src : (event.message || "error");
            send("js-error:" + detail);
          }, true);
          window.addEventListener("unhandledrejection", function (event) {
            var reason = event.reason;
            send("js-error:" + (reason && reason.message ? reason.message : "rejection"));
          });
          function report() {
            send("boot:" + location.href + " " + window.innerWidth + "x" + window.innerHeight);
          }
          report();
          document.addEventListener("DOMContentLoaded", report);
        })();
        """
        controller.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        logSurface("appear")
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            self?.logSurface("8s")
            self?.captureFrame(reason: "8s")
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "razzberry", let body = message.body as? String else { return }
        let text = scrub(body)
        if text == "webgl-ready" {
            NSLog("RAZZBERRY_WEBGL_READY")
            guard !capturedReadyFrame else { return }
            capturedReadyFrame = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                self?.captureFrame(reason: "webgl-ready")
            }
        } else if text == "webgl-unavailable" {
            NSLog("RAZZBERRY_WEBGL_UNAVAILABLE")
        } else {
            NSLog("RAZZBERRY_JS %@", text)
        }
    }

    private func logSurface(_ reason: String) {
        let bounds = webView?.bounds ?? .zero
        let url = webView?.url?.absoluteString ?? "nil"
        NSLog("RAZZBERRY_SURFACE %@ %@ %.0fx%.0f", reason, url, bounds.width, bounds.height)
    }

    private func captureFrame(reason: String) {
        guard let webView, webView.bounds.width > 1, webView.bounds.height > 1 else {
            NSLog("RAZZBERRY_SNAPSHOT_FAILED %@ empty-webview", reason)
            return
        }
        let config = WKSnapshotConfiguration()
        config.rect = webView.bounds
        webView.takeSnapshot(with: config) { image, error in
            if let error {
                NSLog("RAZZBERRY_SNAPSHOT_FAILED %@ %@", reason, error.localizedDescription)
                return
            }
            guard let image, let data = image.pngData() else {
                NSLog("RAZZBERRY_SNAPSHOT_FAILED %@ no-image", reason)
                return
            }
            let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("razzberry-frame.png")
            do {
                try data.write(to: url, options: .atomic)
                NSLog("RAZZBERRY_SNAPSHOT %@ %.0fx%.0f %@", reason, image.size.width, image.size.height, url.path)
            } catch {
                NSLog("RAZZBERRY_SNAPSHOT_FAILED %@ %@", reason, error.localizedDescription)
            }
        }
    }

    private func scrub(_ body: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: "AIza[0-9A-Za-z\\-_]{20,}") else { return body }
        return regex.stringByReplacingMatches(in: body, range: NSRange(body.startIndex..., in: body), withTemplate: "[redacted]")
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // One window. The storyboard is not attached, so it cannot cover this web view with an empty one.
        let window = UIWindow(windowScene: windowScene)
        window.backgroundColor = UIColor(red: 7 / 255, green: 6 / 255, blue: 10 / 255, alpha: 1)
        window.rootViewController = RazzberryBridgeViewController()
        self.window = window
        window.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
