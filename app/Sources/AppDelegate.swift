// AppDelegate.swift — boot order, teardown, and the guarantee that node dies with us.
import AppKit
import Darwin

final class AppDelegate: NSObject, NSApplicationDelegate {
    let server = ServerProcess()
    var api: GameAPI!
    var game: GameWindow!
    private var signalSources: [DispatchSourceSignal] = []
    private var terminating = false

    // MARK: launch

    func applicationDidFinishLaunching(_ notification: Notification) {
        SQ.ensureDirs()
        installSignalHandlers()

        do {
            try server.start()
        } catch {
            fatalStartupError(error.localizedDescription)
            return
        }

        api = GameAPI(base: server.baseURL)
        game = GameWindow()
        game.onWindowClosed = { [weak self] in self?.shutdown() }

        PreferencesPanel.shared.onScaleChange = { [weak self] _ in self?.game.applyPixelScale() }
        buildMenuBar()

        // Show the window immediately so the app doesn't look hung, then load once
        // the server actually answers. A blank dark window for ~300ms beats a beachball.
        game.window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        server.waitUntilReady(timeout: 20) { [weak self] ok in
            guard let self else { return }
            if ok {
                self.game.show(url: self.server.baseURL)
            } else {
                self.fatalStartupError(
                    "The game server did not answer on port \(self.server.port) within 20 seconds.")
            }
        }
    }

    private func fatalStartupError(_ detail: String) {
        let a = NSAlert()
        a.alertStyle = .critical
        a.messageText = "StudyQuest could not start"
        a.informativeText = """
        \(detail)

        The full server log is at:
        \(SQ.logFile.path)
        """
        a.addButton(withTitle: "Show Log")
        a.addButton(withTitle: "Quit")
        if a.runModal() == .alertFirstButtonReturn {
            NSWorkspace.shared.selectFile(SQ.logFile.path, inFileViewerRootedAtPath: SQ.logDir.path)
        }
        shutdown()
        NSApp.terminate(nil)
    }

    // MARK: teardown

    /// Every exit path funnels here. Idempotent.
    func shutdown() {
        guard !terminating else { return }
        terminating = true
        server.stop()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        shutdown()
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        shutdown()
        return .terminateNow
    }

    /// If the app is closed with no window (Dock click), put it back.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { game?.window.makeKeyAndOrderFront(nil) }
        return true
    }

    /// SIGINT / SIGTERM arrive when the app is launched from a terminal or killed by
    /// launchd. NSApplication does not turn those into applicationWillTerminate, so
    /// they get their own handler. (SIGKILL can't be caught — the shell wrapper
    /// around node covers that case instead.)
    private func installSignalHandlers() {
        for sig in [SIGINT, SIGTERM, SIGHUP] {
            signal(sig, SIG_IGN)
            let src = DispatchSource.makeSignalSource(signal: sig, queue: .main)
            src.setEventHandler { [weak self] in
                self?.shutdown()
                exit(0)
            }
            src.resume()
            signalSources.append(src)
        }
    }
}
