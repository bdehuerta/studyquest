// GameWindow.swift — the NSWindow + WKWebView that hosts the game, plus the
// JavaScript bridge calls the menu bar makes into the page.
import AppKit
import WebKit

final class GameWindow: NSObject, WKNavigationDelegate, WKUIDelegate, NSWindowDelegate, WKScriptMessageHandler {
    let window: NSWindow
    let webView: WKWebView
    private var didFinishFirstLoad = false
    var onWindowClosed: (() -> Void)?

    /// Injected before the page's own scripts: kills the browser-isms that break the
    /// illusion of a native app (rubber-band bounce, text drag-select, context menu,
    /// pinch zoom, the backspace/⌘-arrow navigation gestures).
    private static let nativeFeelJS = """
    (function () {
      const css = `
        html, body { overscroll-behavior: none; overflow: hidden;
                     -webkit-user-select: none; user-select: none;
                     -webkit-touch-callout: none; }
        canvas { -webkit-user-drag: none; user-select: none; cursor: default; }
        img { -webkit-user-drag: none; }
        input, textarea, [contenteditable="true"] {
          -webkit-user-select: text; user-select: text; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #2a2f3d; border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
      `;
      const apply = () => {
        if (document.getElementById('sq-native-style')) return;
        const s = document.createElement('style');
        s.id = 'sq-native-style';
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
      };
      apply();
      document.addEventListener('DOMContentLoaded', apply);

      const editable = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      document.addEventListener('contextmenu', (e) => { if (!editable(e.target)) e.preventDefault(); });
      document.addEventListener('dragstart', (e) => { if (!editable(e.target)) e.preventDefault(); });
      document.addEventListener('gesturestart', (e) => e.preventDefault());
      // Swallow the swipe/backspace "go back" affordances; there is nowhere to go.
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !editable(e.target)) e.preventDefault();
      });
      // Mark the document NATIVE so the page can reserve the top-left corner
      // for the macOS traffic lights. The window uses a full-size content view
      // with no titlebar area, so close/minimise/zoom sit directly on top of the
      // HUD banner. The page cannot know that on its own, and the BROWSER build
      // must not get a mystery gap — so it is an attribute the CSS keys off,
      // not an unconditional pad. (Bruno, 2026-08-31.)
      const markNative = () => {
        const root = document.documentElement;
        if (root) root.setAttribute('data-native', 'macos');
      };
      markNative();
      document.addEventListener('DOMContentLoaded', markNative);
      window.__sqNative = true;
      // The page cannot close a window it did not open, so QUIT in the launch
      // menu used to dead-end on "close it from the title bar". Hand the request
      // to AppKit instead, which can actually terminate the app.
      window.__sqQuit = function () {
        try {
          window.webkit.messageHandlers.sq.postMessage({ type: 'quit' });
          return true;
        } catch (e) { return false; }
      };
    })();
    """

    override init() {
        let cfg = WKWebViewConfiguration()
        cfg.suppressesIncrementalRendering = false
        let script = WKUserScript(source: GameWindow.nativeFeelJS,
                                  injectionTime: .atDocumentStart,
                                  forMainFrameOnly: true)
        cfg.userContentController.addUserScript(script)
        if #available(macOS 13.3, *) { cfg.preferences.isElementFullscreenEnabled = true }
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 860), configuration: cfg)
        webView.setValue(false, forKey: "drawsBackground")   // no white flash before first paint
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsMagnification = false
        webView.autoresizingMask = [.width, .height]

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false)
        window.title = SQ.appName
        window.minSize = NSSize(width: 1100, height: 760)
        window.backgroundColor = SQ.bg
        window.titlebarAppearsTransparent = true
        // HIDE THE TITLE TEXT. With `.fullSizeContentView` and a transparent
        // titlebar, AppKit still DRAWS the window title over the content — and
        // with the HUD banner at y=0 that put a bold "StudyQuest" straight
        // across the player's name. Reserving a gutter for the traffic lights
        // did nothing about it, because the title is not the traffic lights:
        // it starts to their RIGHT and runs into whatever is there.
        //
        // The window needs no visible title — the app name is in the menu bar
        // and the HUD says who you are. `.hidden` keeps the titlebar (so the
        // lights, dragging and double-click-to-zoom all still work) and only
        // drops the text.
        window.titleVisibility = .hidden
        window.isReleasedWhenClosed = false
        window.tabbingMode = .disallowed
        window.collectionBehavior.insert(.fullScreenPrimary)

        super.init()

        window.contentView = webView
        window.delegate = self
        webView.navigationDelegate = self
        webView.uiDelegate = self
        // `sq` is the page's one channel into AppKit. It can only be registered
        // after super.init(), because it hands over `self`.
        webView.configuration.userContentController.add(self, name: "sq")

        // Remembers position and size across launches.
        window.setFrameAutosaveName("SQMainWindow")
        if window.frame.width < window.minSize.width || window.frame.height < window.minSize.height {
            window.setContentSize(NSSize(width: 1280, height: 860))
            window.center()
        }
        applyPixelScale()
    }

    // MARK: - the page's channel into AppKit

    /// Messages from `window.webkit.messageHandlers.sq`.
    ///
    /// Only what the page is explicitly allowed to ask for is honoured, by name.
    /// Anything else is ignored rather than guessed at.
    func userContentController(_ controller: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let type = body["type"] as? String else { return }
        switch type {
        case "quit":
            // The same path as ⌘Q and the Quit menu item: the app delegate stops
            // the node child on terminate, so the save is already flushed by the
            // time this is called — the page saves before it asks.
            NSApp.terminate(nil)
        default:
            break
        }
    }

    // MARK: lifecycle

    func show(url: URL) {
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if Prefs.launchFullScreen && !window.styleMask.contains(.fullScreen) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
                self?.window.toggleFullScreen(nil)
            }
        }
    }

    func reload() {
        webView.reloadFromOrigin()
    }

    func windowWillClose(_ notification: Notification) {
        onWindowClosed?()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        didFinishFirstLoad = true
        applyPixelScale()
    }

    /// The page has no reason to open a second window; fold any attempt back into this one.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { webView.load(URLRequest(url: url)) }
        return nil
    }

    // MARK: zoom

    func applyPixelScale() { webView.pageZoom = CGFloat(Prefs.pixelScale) }

    func setZoom(_ z: Double) {
        let clamped = min(2.0, max(0.5, z))
        Prefs.pixelScale = clamped
        applyPixelScale()
    }

    var zoom: Double { Prefs.pixelScale }

    // MARK: the window.sqMenu bridge
    //
    // Every call is guarded: the page may still be loading, the bridge may not have
    // been installed yet, or a bad state may have thrown. A missing bridge is a
    // no-op, never a crash and never a dialog — the menu item just does nothing.

    private func callBridge(_ body: String, completion: ((String) -> Void)? = nil) {
        guard didFinishFirstLoad else { completion?("not-loaded"); return }
        let guarded = """
        (function () {
          try {
            if (!window.sqMenu || window.sqMenu.ready !== true) return 'no-bridge';
            \(body)
          } catch (e) { return 'error: ' + (e && e.message); }
        })();
        """
        webView.evaluateJavaScript(guarded) { result, error in
            let outcome: String
            if let error { outcome = "js-error: \(error.localizedDescription)" }
            else { outcome = (result as? String) ?? "ok" }
            if outcome != "ok" { NSLog("[sqMenu] %@", outcome) }
            completion?(outcome)
        }
    }

    /// The panel set is still growing (shops/importer land with another agent), so a
    /// name the page doesn't know yet must read as "not yet", never as a broken menu.
    func openPanel(_ name: String, unavailable: ((String) -> Void)? = nil) {
        callBridge("""
          if (typeof window.sqMenu.openPanel !== 'function') return 'no-openPanel';
          return window.sqMenu.openPanel('\(name)') === false ? 'unknown-panel' : 'ok';
        """) { outcome in
            if outcome != "ok" { unavailable?(outcome) }
        }
    }

    func reloadState() {
        callBridge("""
          if (typeof window.sqMenu.reloadState !== 'function') return 'no-reloadState';
          window.sqMenu.reloadState();
          return 'ok';
        """)
    }

    func toast(_ message: String) {
        // JSON-encode through an array so quotes/newlines in the message can't break out.
        let json = (try? JSONSerialization.data(withJSONObject: [message]))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        callBridge("""
          if (typeof window.sqMenu.toast !== 'function') return 'no-toast';
          window.sqMenu.toast(\(json)[0]);
          return 'ok';
        """)
    }

    func closePanels() {
        callBridge("""
          if (typeof window.sqMenu.closePanels !== 'function') return 'no-closePanels';
          window.sqMenu.closePanels();
          return 'ok';
        """)
    }
}
