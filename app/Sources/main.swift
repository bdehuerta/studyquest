// main.swift — entry point. Deliberately tiny; everything real is in AppDelegate.
import AppKit

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)

// `StudyQuest --dump-menus` builds the menu bar, prints it, and exits without
// starting the server. It exists so the build can be checked from a script: a
// typo'd selector shows up here as (unbound) instead of as a dead menu item.
if CommandLine.arguments.contains("--dump-menus") {
    delegate.buildMenuBar()
    func walk(_ menu: NSMenu, _ depth: Int) {
        let pad = String(repeating: "  ", count: depth)
        for item in menu.items {
            if item.isSeparatorItem { print("\(pad)──────────"); continue }
            var line = "\(pad)\(item.title)"
            if !item.keyEquivalent.isEmpty {
                var mods = ""
                if item.keyEquivalentModifierMask.contains(.control) { mods += "^" }
                if item.keyEquivalentModifierMask.contains(.option) { mods += "⌥" }
                if item.keyEquivalentModifierMask.contains(.shift) { mods += "⇧" }
                if item.keyEquivalentModifierMask.contains(.command) { mods += "⌘" }
                line += "  \(mods)\(item.keyEquivalent.uppercased())"
            }
            if item.submenu != nil {
                line += "   ▸"
            } else if let action = item.action {
                // target nil == travels the responder chain, which is correct for
                // AppKit's own selectors and not something we can resolve here.
                if item.target == nil {
                    line += "   [chain \(NSStringFromSelector(action))]"
                } else if item.target!.responds(to: action) {
                    line += "   [→ \(NSStringFromSelector(action))]"
                } else {
                    line += "   [UNBOUND \(NSStringFromSelector(action))]"
                }
            } else if item.submenu == nil {
                line += "   (no action)"
            }
            print(line)
            if let sub = item.submenu { walk(sub, depth + 1) }
        }
    }
    walk(NSApp.mainMenu!, 0)

    // With SQ_PROBE_PORT set against an already-running server, also exercise the one
    // menu that has real logic behind it: Switch Save is built from /api/slots at
    // open-time, so this is the only way to see it without clicking.
    if let p = ProcessInfo.processInfo.environment["SQ_PROBE_PORT"],
       let url = URL(string: "http://127.0.0.1:\(p)") {
        delegate.api = GameAPI(base: url)
        if let file = NSApp.mainMenu?.items.first(where: { $0.title == "File" })?.submenu,
           let sub = file.items.first(where: { $0.title == "Switch Save" })?.submenu {
            print("\nSwitch Save ▸ (live from \(url.absoluteString)/api/slots)")
            delegate.menuNeedsUpdate(sub)
            for i in sub.items {
                print("  \(i.state == .on ? "✓" : " ") \(i.title)\(i.isEnabled ? "" : "   (disabled)")")
            }
        }
    }
    exit(0)
}

app.run()
