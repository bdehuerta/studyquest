// Support.swift — small shared helpers: paths, defaults, free-port discovery, logging.
import AppKit
import Darwin

enum SQ {
    static let bundleID = "com.brunodehuerta.studyquest"
    static let appName = "StudyQuest"

    // Game palette (kept in sync with shared/constants.js by eye, not by import).
    static let bg = NSColor(srgbRed: 0x12 / 255.0, green: 0x14 / 255.0, blue: 0x1c / 255.0, alpha: 1)
    static let gold = NSColor(srgbRed: 1.0, green: 0xd9 / 255.0, blue: 0x3d / 255.0, alpha: 1)
    static let blue = NSColor(srgbRed: 0x4a / 255.0, green: 0xa3 / 255.0, blue: 1.0, alpha: 1)
    static let purple = NSColor(srgbRed: 0xa8 / 255.0, green: 0x6c / 255.0, blue: 1.0, alpha: 1)

    /// Where the game's data/ folder is redirected to (server honours SQ_DATA_DIR).
    ///
    /// SQ_DATA_DIR in our OWN environment wins, which is how `build-app.sh --verify`
    /// launches a real bundle against a scratch directory. Without this the only
    /// way to test a launch end-to-end is to point the app at the user's actual
    /// saves, which is not a test anybody should have to run.
    static var dataDir: URL {
        if let override = ProcessInfo.processInfo.environment["SQ_DATA_DIR"],
           !override.trimmingCharacters(in: .whitespaces).isEmpty {
            var p = override.trimmingCharacters(in: .whitespaces)
            if p == "~" { p = NSHomeDirectory() }
            else if p.hasPrefix("~/") { p = NSHomeDirectory() + String(p.dropFirst(1)) }
            return URL(fileURLWithPath: (p as NSString).standardizingPath, isDirectory: true)
        }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent(appName, isDirectory: true)
    }

    static var logDir: URL {
        if let override = ProcessInfo.processInfo.environment["SQ_LOG_DIR"],
           !override.trimmingCharacters(in: .whitespaces).isEmpty {
            return URL(fileURLWithPath: (override as NSString).standardizingPath, isDirectory: true)
        }
        let base = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Logs/\(appName)", isDirectory: true)
    }

    static var logFile: URL { logDir.appendingPathComponent("server.log") }

    static var version: String {
        let d = Bundle.main.infoDictionary
        let short = d?["CFBundleShortVersionString"] as? String ?? "0.2.0"
        let build = d?["CFBundleVersion"] as? String ?? "1"
        return "\(short) (\(build))"
    }

    /// Resources/app inside the bundle — the copy of the game we run.
    /// Falls back to a dev path so the binary is runnable straight out of swiftc.
    static var gameRoot: URL {
        if let r = Bundle.main.resourceURL {
            let inBundle = r.appendingPathComponent("app", isDirectory: true)
            if FileManager.default.fileExists(atPath: inBundle.appendingPathComponent("server.js").path) {
                return inBundle
            }
        }
        return URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    }

    static func ensureDirs() {
        for d in [dataDir, logDir] {
            try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        }
    }

    /// Ask the kernel for a port nobody is using: bind :0, read it back, close.
    /// Racy in theory, fine in practice, and far better than guessing 7777.
    static func freePort() -> UInt16 {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return 7777 }
        defer { close(fd) }
        var yes: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = 0
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)

        let bound = withUnsafePointer(to: &addr) { p -> Int32 in
            p.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bound == 0 else { return 7777 }

        var out = sockaddr_in()
        var len = socklen_t(MemoryLayout<sockaddr_in>.size)
        let got = withUnsafeMutablePointer(to: &out) { p -> Int32 in
            p.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &len) }
        }
        guard got == 0 else { return 7777 }
        return UInt16(bigEndian: out.sin_port)
    }

    /// Find node. `open`-launched apps get a bare PATH, so search the usual homes.
    static func findNode() -> String? {
        let fm = FileManager.default
        var candidates = [
            "/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node",
            "/opt/homebrew/opt/node/bin/node",
        ]
        if let home = ProcessInfo.processInfo.environment["HOME"] {
            candidates.append(contentsOf: [
                "\(home)/.nvm/versions/node/current/bin/node",
                "\(home)/.volta/bin/node",
                "\(home)/.local/bin/node",
            ])
            // Newest nvm install, if any.
            let nvm = "\(home)/.nvm/versions/node"
            if let vs = try? fm.contentsOfDirectory(atPath: nvm) {
                for v in vs.sorted().reversed() { candidates.append("\(nvm)/\(v)/bin/node") }
            }
        }
        // Whatever the build recorded, first.
        if let baked = Bundle.main.object(forInfoDictionaryKey: "SQNodePath") as? String, !baked.isEmpty {
            candidates.insert(baked, at: 0)
        }
        for c in candidates where fm.isExecutableFile(atPath: c) { return c }
        return nil
    }
}

/// UserDefaults-backed preferences.
enum Prefs {
    private static let d = UserDefaults.standard
    static var launchFullScreen: Bool {
        get { d.bool(forKey: "sq.launchFullScreen") }
        set { d.set(newValue, forKey: "sq.launchFullScreen") }
    }
    static var pixelScale: Double {
        get {
            let v = d.double(forKey: "sq.pixelScale")
            return v <= 0 ? 1.0 : v
        }
        set { d.set(newValue, forKey: "sq.pixelScale") }
    }
}
