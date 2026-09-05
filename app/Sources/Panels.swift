// Panels.swift — the native windows: About, Preferences, Help.
import AppKit

// MARK: - shared bits

private func label(_ text: String, size: CGFloat = 13, weight: NSFont.Weight = .regular,
                   color: NSColor = .labelColor) -> NSTextField {
    let t = NSTextField(labelWithString: text)
    t.font = .systemFont(ofSize: size, weight: weight)
    t.textColor = color
    t.lineBreakMode = .byWordWrapping
    t.maximumNumberOfLines = 0
    return t
}

private func panelWindow(title: String, size: NSSize) -> NSWindow {
    let w = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                     styleMask: [.titled, .closable], backing: .buffered, defer: false)
    w.title = title
    w.isReleasedWhenClosed = false
    w.center()
    return w
}

// MARK: - About

final class AboutPanel {
    static let shared = AboutPanel()
    private var window: NSWindow?

    func show() {
        if let w = window { w.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true); return }
        let w = panelWindow(title: "About StudyQuest", size: NSSize(width: 420, height: 300))

        let icon = NSImageView()
        icon.image = NSApp.applicationIconImage
        icon.imageScaling = .scaleProportionallyUpOrDown
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.widthAnchor.constraint(equalToConstant: 96).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 96).isActive = true

        let name = label("StudyQuest", size: 22, weight: .semibold)
        let ver = label("Version \(SQ.version)", size: 12, color: .secondaryLabelColor)
        let flavour = label("Energy is only minted by real study. "
                            + "No amount of axes will chop a tree you did not earn.",
                            size: 12, color: .secondaryLabelColor)
        flavour.alignment = .center
        name.alignment = .center
        ver.alignment = .center

        let paths = label("Saves: \(SQ.dataDir.path)\nLog: \(SQ.logFile.path)",
                          size: 10, color: .tertiaryLabelColor)
        paths.alignment = .center

        let stack = NSStackView(views: [icon, name, ver, flavour, paths])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 8
        stack.edgeInsets = NSEdgeInsets(top: 22, left: 24, bottom: 22, right: 24)
        stack.translatesAutoresizingMaskIntoConstraints = false

        let content = NSView()
        content.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            stack.topAnchor.constraint(equalTo: content.topAnchor),
        ])
        w.contentView = content
        window = w
        w.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

// MARK: - Help

final class HelpPanel {
    static let shared = HelpPanel()
    private var window: NSWindow?

    private let body = """
    MOVING
      W A S D or the arrow keys walk the scholar around the world.
      E, or a click, interacts with whatever you are standing next to.

    GATHERING
      Trees, stone, water reeds and sand are harvestable nodes. Each swing
      costs Energy and one point of durability from the matching tool —
      axe for trees, pickaxe for stone, dredge for water, sifter for sand.
      Depleted nodes leave a stump and respawn on their own after a while.

    ENERGY
      Energy comes only from tracked study: 1 per 3 minutes logged, plus
      8 × difficulty when you finish a task. It never regenerates on its own.
      That is the whole design — the world is somewhere to spend study,
      not somewhere to avoid it.

    MENUS
      Game ▸ opens the four panels: Quests ⌘1, Craft ⌘2, Shops ⌘3,
      Dark Boxes ⌘4. Reload State ⌘R re-reads the save from the server.
      File ▸ Import Tasks… takes your real syllabus as JSON, CSV, TSV,
      a Markdown checklist, or just one task per line.
      File ▸ Switch Save ▸ lists all five slots with level and playtime.
      View ▸ zooms the pixel art in whole comfortable steps.

    WHERE THINGS LIVE
      Saves:  ~/Library/Application Support/StudyQuest/
      Log:    ~/Library/Logs/StudyQuest/server.log
    """

    func show() {
        if let w = window { w.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true); return }
        let w = panelWindow(title: "StudyQuest Help", size: NSSize(width: 560, height: 520))
        w.styleMask.insert(.resizable)

        let text = NSTextView()
        text.string = body
        text.isEditable = false
        text.isSelectable = true
        text.drawsBackground = false
        text.font = .monospacedSystemFont(ofSize: 11.5, weight: .regular)
        text.textContainerInset = NSSize(width: 18, height: 18)

        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        scroll.documentView = text
        scroll.autoresizingMask = [.width, .height]
        scroll.frame = w.contentLayoutRect

        w.contentView = scroll
        window = w
        w.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

// MARK: - Preferences

final class PreferencesPanel: NSObject {
    static let shared = PreferencesPanel()
    private var window: NSWindow?
    private var scalePopup: NSPopUpButton?
    private var fullScreenBox: NSButton?

    /// Set by the app delegate so a scale change reaches the live webview.
    var onScaleChange: ((Double) -> Void)?

    private let scales: [Double] = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0]

    func show() {
        if let w = window { sync(); w.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true); return }
        let w = panelWindow(title: "StudyQuest Preferences", size: NSSize(width: 440, height: 240))

        let box = NSButton(checkboxWithTitle: "Open in full screen on launch",
                           target: self, action: #selector(toggleFullScreen(_:)))
        fullScreenBox = box

        let popup = NSPopUpButton(frame: .zero, pullsDown: false)
        popup.addItems(withTitles: scales.map { "\(Int($0 * 100))%" })
        popup.target = self
        popup.action = #selector(changeScale(_:))
        scalePopup = popup

        let scaleRow = NSStackView(views: [label("Pixel scale"), popup])
        scaleRow.orientation = .horizontal
        scaleRow.spacing = 12

        let reveal = NSButton(title: "Reveal Save Folder in Finder",
                              target: self, action: #selector(revealSaves(_:)))
        reveal.bezelStyle = .rounded

        let note = label("Saves live in ~/Library/Application Support/StudyQuest/ so they survive "
                         + "rebuilding or replacing the app.", size: 11, color: .secondaryLabelColor)
        note.preferredMaxLayoutWidth = 380

        let stack = NSStackView(views: [box, scaleRow, reveal, note])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 14
        stack.edgeInsets = NSEdgeInsets(top: 22, left: 24, bottom: 22, right: 24)
        stack.translatesAutoresizingMaskIntoConstraints = false

        let content = NSView()
        content.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: content.trailingAnchor),
            stack.topAnchor.constraint(equalTo: content.topAnchor),
        ])
        w.contentView = content
        window = w
        sync()
        w.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Reflect current prefs into the controls (also called when reopening).
    func sync() {
        fullScreenBox?.state = Prefs.launchFullScreen ? .on : .off
        let current = Prefs.pixelScale
        let idx = scales.firstIndex(where: { abs($0 - current) < 0.01 }) ?? 1
        scalePopup?.selectItem(at: idx)
    }

    @objc private func toggleFullScreen(_ sender: NSButton) {
        Prefs.launchFullScreen = sender.state == .on
    }

    @objc private func changeScale(_ sender: NSPopUpButton) {
        let v = scales[min(max(0, sender.indexOfSelectedItem), scales.count - 1)]
        Prefs.pixelScale = v
        onScaleChange?(v)
    }

    @objc private func revealSaves(_ sender: Any?) {
        SQ.ensureDirs()
        NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: SQ.dataDir.path)
    }
}

// MARK: - alerts

enum Alerts {
    @discardableResult
    static func info(_ title: String, _ text: String, style: NSAlert.Style = .informational) -> NSApplication.ModalResponse {
        let a = NSAlert()
        a.alertStyle = style
        a.messageText = title
        a.informativeText = text
        a.addButton(withTitle: "OK")
        return a.runModal()
    }

    static func confirm(_ title: String, _ text: String, confirmTitle: String,
                        destructive: Bool = false) -> Bool {
        let a = NSAlert()
        a.alertStyle = destructive ? .critical : .warning
        a.messageText = title
        a.informativeText = text
        let yes = a.addButton(withTitle: confirmTitle)
        a.addButton(withTitle: "Cancel")
        if destructive, #available(macOS 11.0, *) { yes.hasDestructiveAction = true }
        return a.runModal() == .alertFirstButtonReturn
    }

    /// A prompt with an accessory text field — the sanctioned replacement for
    /// window.prompt(), which the contract forbids anyway.
    static func prompt(_ title: String, _ text: String, placeholder: String,
                       initial: String = "", confirmTitle: String = "OK") -> String? {
        let a = NSAlert()
        a.messageText = title
        a.informativeText = text
        a.addButton(withTitle: confirmTitle)
        a.addButton(withTitle: "Cancel")

        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        field.placeholderString = placeholder
        field.stringValue = initial
        a.accessoryView = field
        a.window.initialFirstResponder = field

        guard a.runModal() == .alertFirstButtonReturn else { return nil }
        let value = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
