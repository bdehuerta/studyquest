// GameAPI.swift — thin URLSession client for the routes the menu bar drives.
// Slot + import operations go through here rather than the page: Swift owns the
// port, so this works even while the webview is still loading.
import Foundation

struct Slot {
    let slot: Int
    let name: String
    let level: Int
    let playtimeMs: Double
    let exists: Bool
    let active: Bool

    /// "Save 1 — LV 4 — 2h 14m". Empty slots already name themselves ("Empty slot 3").
    var menuTitle: String {
        exists ? "\(name) — LV \(level) — \(Slot.playtime(playtimeMs))" : name
    }

    static func playtime(_ ms: Double) -> String {
        let total = Int(max(0, ms) / 1000)
        let h = total / 3600, m = (total % 3600) / 60
        if h > 0 { return "\(h)h \(m)m" }
        if m > 0 { return "\(m)m" }
        return "\(total)s"
    }
}

final class GameAPI {
    private let base: URL
    init(base: URL) { self.base = base }

    struct APIError: LocalizedError {
        let message: String
        /// True when the route simply isn't wired up yet (404/405). The menu treats
        /// this as "not available yet" and stays quiet instead of raising a dialog —
        /// server agents are landing these routes concurrently.
        var unavailable: Bool = false
        var errorDescription: String? { message }
    }

    // MARK: raw

    private func request(_ path: String, method: String, body: [String: Any]?) -> URLRequest {
        var req = URLRequest(url: base.appendingPathComponent(path))
        req.httpMethod = method
        req.timeoutInterval = 20
        req.cachePolicy = .reloadIgnoringLocalCacheData
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        return req
    }

    private func send(_ req: URLRequest, _ done: @escaping (Result<[String: Any], Error>) -> Void) {
        URLSession.shared.dataTask(with: req) { data, resp, err in
            DispatchQueue.main.async {
                if let err { return done(.failure(err)) }
                let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
                if status == 404 || status == 405 {
                    return done(.failure(APIError(
                        message: "That part of StudyQuest isn’t available in this build yet.",
                        unavailable: true)))
                }
                guard let data,
                      let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    return done(.failure(APIError(message: "The server sent a reply StudyQuest could not read.")))
                }
                // The contract: errors arrive as {ok:false,error} with HTTP 200.
                if let ok = obj["ok"] as? Bool, ok == false {
                    return done(.failure(APIError(message: obj["error"] as? String ?? "Unknown error.")))
                }
                done(.success(obj))
            }
        }.resume()
    }

    func get(_ path: String, _ done: @escaping (Result<[String: Any], Error>) -> Void) {
        send(request(path, method: "GET", body: nil), done)
    }

    func post(_ path: String, _ body: [String: Any],
              _ done: @escaping (Result<[String: Any], Error>) -> Void) {
        send(request(path, method: "POST", body: body), done)
    }

    /// Blocking GET, for the few places a menu genuinely needs an answer before it
    /// can be drawn (the Switch Save submenu is built at open-time).
    func getSync(_ path: String, timeout: TimeInterval = 3) -> [String: Any]? {
        let sem = DispatchSemaphore(value: 0)
        var out: [String: Any]?
        var req = request(path, method: "GET", body: nil)
        req.timeoutInterval = timeout
        URLSession.shared.dataTask(with: req) { data, _, _ in
            if let data { out = try? JSONSerialization.jsonObject(with: data) as? [String: Any] }
            sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + timeout + 1)
        return out
    }

    // MARK: typed

    func slotsSync() -> (slots: [Slot], active: Int) {
        guard let obj = getSync("/api/slots"), let raw = obj["slots"] as? [[String: Any]] else {
            return ([], 1)
        }
        let slots = raw.map { d in
            Slot(slot: d["slot"] as? Int ?? 0,
                 name: d["name"] as? String ?? "Save",
                 level: d["level"] as? Int ?? 1,
                 playtimeMs: (d["playtimeMs"] as? NSNumber)?.doubleValue ?? 0,
                 exists: d["exists"] as? Bool ?? true,
                 active: d["active"] as? Bool ?? false)
        }.sorted { $0.slot < $1.slot }

        // The server flags the active slot on the row itself. A top-level `active`
        // and then state.meta.slot are fallbacks, so this survives either shape.
        if let a = slots.first(where: { $0.active }) { return (slots, a.slot) }
        if let a = obj["active"] as? Int, a > 0 { return (slots, a) }
        if let s = getSync("/api/state"),
           let st = s["state"] as? [String: Any],
           let meta = st["meta"] as? [String: Any],
           let n = meta["slot"] as? Int { return (slots, n) }
        return (slots, slots.first(where: { $0.exists })?.slot ?? 1)
    }
}
