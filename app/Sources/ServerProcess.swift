// ServerProcess.swift — owns the node child: port, launch, readiness polling, teardown.
import Foundation
import Darwin

/// A shell wrapper sits between us and node for one reason: if this app is killed
/// with SIGKILL (crash, Force Quit, debugger detach) our own cleanup never runs, so
/// something else has to notice. The wrapper polls our pid and reaps node when we die.
private let runnerScript = """
PARENT="$1"; shift
"$@" &
CHILD=$!
trap 'kill "$CHILD" 2>/dev/null' TERM INT HUP
( while kill -0 "$PARENT" 2>/dev/null; do sleep 1; done; kill "$CHILD" 2>/dev/null ) &
WATCH=$!
wait "$CHILD"
kill "$WATCH" 2>/dev/null
exit 0
"""

final class ServerProcess {
    private(set) var port: UInt16 = 0
    private var proc: Process?
    private var logHandle: FileHandle?
    private var stopped = false

    var baseURL: URL { URL(string: "http://127.0.0.1:\(port)")! }

    enum StartError: LocalizedError {
        case nodeMissing
        case gameMissing(String)
        case launchFailed(String)
        var errorDescription: String? {
            switch self {
            case .nodeMissing:
                return "Node.js could not be found. StudyQuest needs Node 18 or newer on this Mac."
            case .gameMissing(let p):
                return "The bundled game is missing (expected server.js at \(p))."
            case .launchFailed(let m):
                return "The game server failed to start: \(m)"
            }
        }
    }

    // MARK: launch

    func start() throws {
        SQ.ensureDirs()
        port = SQ.freePort()

        let root = SQ.gameRoot
        let serverJS = root.appendingPathComponent("server.js")
        guard FileManager.default.fileExists(atPath: serverJS.path) else {
            throw StartError.gameMissing(serverJS.path)
        }
        guard let node = SQ.findNode() else { throw StartError.nodeMissing }

        // Fresh log per launch, with a header that makes support questions answerable.
        let header = """

        ─────────────────────────────────────────────
        StudyQuest \(SQ.version) — launch \(ISO8601DateFormatter().string(from: Date()))
        node      : \(node)
        game root : \(root.path)
        data dir  : \(SQ.dataDir.path)
        port      : \(port)
        ─────────────────────────────────────────────

        """
        let fm = FileManager.default
        if !fm.fileExists(atPath: SQ.logFile.path) {
            fm.createFile(atPath: SQ.logFile.path, contents: nil)
        }
        let handle = try FileHandle(forWritingTo: SQ.logFile)
        handle.seekToEndOfFile()
        handle.write(Data(header.utf8))
        logHandle = handle

        var env = ProcessInfo.processInfo.environment
        env["PORT"] = String(port)
        env["SQ_DATA_DIR"] = SQ.dataDir.path
        env["SQ_NATIVE"] = "1"
        env["NODE_ENV"] = env["NODE_ENV"] ?? "production"
        // `open`-launched apps inherit a minimal PATH; give node's own dir a place on it.
        let nodeDir = (node as NSString).deletingLastPathComponent
        env["PATH"] = "\(nodeDir):/usr/bin:/bin:/usr/sbin:/sbin"

        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/sh")
        p.arguments = ["-c", runnerScript, "sq-runner",
                       String(ProcessInfo.processInfo.processIdentifier),
                       node, "server.js"]
        p.currentDirectoryURL = root
        p.environment = env
        p.standardOutput = handle
        p.standardError = handle

        do { try p.run() } catch { throw StartError.launchFailed(error.localizedDescription) }
        proc = p
    }

    // MARK: readiness

    /// Poll GET /api/state until it answers or we give up.
    func waitUntilReady(timeout: TimeInterval = 20, completion: @escaping (Bool) -> Void) {
        let deadline = Date().addingTimeInterval(timeout)
        let url = baseURL.appendingPathComponent("/api/state")
        DispatchQueue.global(qos: .userInitiated).async {
            var ok = false
            while Date() < deadline {
                if self.stopped { break }
                var req = URLRequest(url: url)
                req.timeoutInterval = 2
                req.cachePolicy = .reloadIgnoringLocalCacheData
                let sem = DispatchSemaphore(value: 0)
                var good = false
                URLSession.shared.dataTask(with: req) { data, resp, _ in
                    if let h = resp as? HTTPURLResponse, h.statusCode == 200, (data?.count ?? 0) > 0 {
                        good = true
                    }
                    sem.signal()
                }.resume()
                _ = sem.wait(timeout: .now() + 3)
                if good { ok = true; break }
                Thread.sleep(forTimeInterval: 0.15)
            }
            DispatchQueue.main.async { completion(ok) }
        }
    }

    // MARK: teardown

    /// Safe to call repeatedly and from a signal handler path.
    func stop() {
        guard !stopped else { return }
        stopped = true
        guard let p = proc, p.isRunning else { logHandle = nil; return }

        let pid = p.processIdentifier
        p.terminate()                       // SIGTERM -> wrapper -> node
        kill(pid, SIGTERM)                  // belt

        // Give it a moment, then insist.
        let deadline = Date().addingTimeInterval(3)
        while p.isRunning && Date() < deadline { usleep(50_000) }
        if p.isRunning {
            kill(pid, SIGKILL)
            usleep(200_000)
        }
        try? logHandle?.close()
        logHandle = nil
        proc = nil
    }

    var isRunning: Bool { proc?.isRunning ?? false }
}
