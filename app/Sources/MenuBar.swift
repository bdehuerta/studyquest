// MenuBar.swift — a real NSMenu tree and the actions behind it.
//
// Two channels talk to the game, deliberately split:
//   • slot + import operations  -> HTTP, via GameAPI. Swift owns the port, so these
//     work regardless of whether the page has finished loading.
//   • UI actions (panels, toasts, state refresh) -> window.sqMenu over the webview.
import AppKit
import UniformTypeIdentifiers

extension AppDelegate: NSMenuDelegate {

    // MARK: - construction

    func buildMenuBar() {
        let main = NSMenu()
        main.addItem(appMenuItem())
        main.addItem(fileMenuItem())
        main.addItem(gameMenuItem())
        main.addItem(viewMenuItem())
        main.addItem(windowMenuItem())
        main.addItem(helpMenuItem())
        NSApp.mainMenu = main
    }

    private func item(_ title: String, _ action: Selector?, _ key: String = "",
                      _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
        if !key.isEmpty { i.keyEquivalentModifierMask = mods }
        if action != nil { i.target = self }
        return i
    }

    /// For AppKit's own selectors, which must travel the responder chain (target nil).
    private func chainItem(_ title: String, _ action: Selector, _ key: String = "",
                           _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
        if !key.isEmpty { i.keyEquivalentModifierMask = mods }
        return i
    }

    private func submenu(_ title: String) -> (NSMenuItem, NSMenu) {
        let holder = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        let menu = NSMenu(title: title)
        holder.submenu = menu
        return (holder, menu)
    }

    // MARK: StudyQuest

    private func appMenuItem() -> NSMenuItem {
        let (holder, m) = submenu(SQ.appName)
        m.addItem(item("About StudyQuest", #selector(showAbout(_:))))
        m.addItem(.separator())
        m.addItem(item("Preferences…", #selector(showPreferences(_:)), ","))
        m.addItem(.separator())

        let (svcHolder, svcMenu) = submenu("Services")
        NSApp.servicesMenu = svcMenu
        m.addItem(svcHolder)
        m.addItem(.separator())

        m.addItem(chainItem("Hide StudyQuest", #selector(NSApplication.hide(_:)), "h"))
        let hideOthers = chainItem("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        m.addItem(hideOthers)
        m.addItem(chainItem("Show All", #selector(NSApplication.unhideAllApplications(_:))))
        m.addItem(.separator())
        m.addItem(item("Quit StudyQuest", #selector(quit(_:)), "q"))
        return holder
    }

    // MARK: File

    private func fileMenuItem() -> NSMenuItem {
        let (holder, m) = submenu("File")
        m.addItem(item("New Save…", #selector(newSave(_:)), "n", [.command, .shift]))

        let (switchHolder, switchMenu) = submenu("Switch Save")
        switchMenu.delegate = self            // rebuilt from /api/slots every time it opens
        switchMenu.identifier = NSUserInterfaceItemIdentifier("sq.switchSave")
        m.addItem(switchHolder)

        m.addItem(item("Rename Save…", #selector(renameSave(_:))))
        m.addItem(item("Delete Save…", #selector(deleteSave(_:))))
        m.addItem(.separator())
        m.addItem(item("Import Tasks…", #selector(importTasks(_:)), "i"))
        m.addItem(item("Export Save…", #selector(exportSave(_:)), "e", [.command, .shift]))
        return holder
    }

    // MARK: Game

    private func gameMenuItem() -> NSMenuItem {
        let (holder, m) = submenu("Game")
        // "Shops" (⌘3) is deliberately GONE.
        //
        // Trading is a place: the Market sells goods, the Archive deals in
        // blueprints, the Exchange trades shards, and the Woodsman buys timber
        // in a cave. A menu item that opened the shop from anywhere in the world
        // made all four the same door and the walk between them pointless.
        // Craft is likewise a place (a house), but its panel refuses on the
        // server side when you are not at one, so it stays.
        for (title, panel, key) in [("Quests", "tasks", "1"), ("Craft", "craft", "2"),
                                    ("Dark Boxes", "gacha", "3")] {
            let i = item(title, #selector(openGamePanel(_:)), key)
            i.representedObject = panel
            m.addItem(i)
        }
        m.addItem(.separator())
        m.addItem(item("Reload State", #selector(reloadState(_:)), "r"))
        return holder
    }

    // MARK: View

    private func viewMenuItem() -> NSMenuItem {
        let (holder, m) = submenu("View")
        m.addItem(item("Actual Size", #selector(zoomActual(_:)), "0"))
        m.addItem(item("Zoom In", #selector(zoomIn(_:)), "+"))
        m.addItem(item("Zoom Out", #selector(zoomOut(_:)), "-"))
        m.addItem(.separator())
        let fs = chainItem("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f")
        fs.keyEquivalentModifierMask = [.command, .control]
        m.addItem(fs)
        return holder
    }

    // MARK: Window / Help

    private func windowMenuItem() -> NSMenuItem {
        let (holder, m) = submenu("Window")
        m.addItem(chainItem("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"))
        m.addItem(chainItem("Zoom", #selector(NSWindow.performZoom(_:))))
        m.addItem(.separator())
        m.addItem(chainItem("Bring All to Front", #selector(NSApplication.arrangeInFront(_:))))
        NSApp.windowsMenu = m
        return holder
    }

    private func helpMenuItem() -> NSMenuItem {
        let (holder, m) = submenu("Help")
        m.addItem(item("StudyQuest Help", #selector(showHelp(_:)), "?"))
        m.addItem(.separator())
        m.addItem(item("Reveal Save Folder", #selector(revealSaveFolder(_:))))
        m.addItem(item("Show Server Log", #selector(revealLog(_:))))
        NSApp.helpMenu = m
        return holder
    }

    // MARK: - Switch Save, built at open time

    public func menuNeedsUpdate(_ menu: NSMenu) {
        guard menu.identifier?.rawValue == "sq.switchSave" else { return }
        menu.removeAllItems()

        let (slots, active) = api.slotsSync()
        guard !slots.isEmpty else {
            let none = NSMenuItem(title: "No saves found", action: nil, keyEquivalent: "")
            none.isEnabled = false
            menu.addItem(none)
            return
        }
        for s in slots {
            let i = NSMenuItem(title: s.menuTitle, action: #selector(switchSave(_:)), keyEquivalent: "")
            i.target = self
            i.representedObject = s.slot
            i.state = (s.slot == active) ? .on : .off
            i.isEnabled = s.exists
            menu.addItem(i)
        }
    }

    // MARK: - actions: app menu

    @objc func showAbout(_ sender: Any?) { AboutPanel.shared.show() }
    @objc func showPreferences(_ sender: Any?) { PreferencesPanel.shared.show() }
    @objc func showHelp(_ sender: Any?) { HelpPanel.shared.show() }
    @objc func quit(_ sender: Any?) { NSApp.terminate(nil) }

    @objc func revealSaveFolder(_ sender: Any?) {
        SQ.ensureDirs()
        NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: SQ.dataDir.path)
    }

    @objc func revealLog(_ sender: Any?) {
        SQ.ensureDirs()
        if FileManager.default.fileExists(atPath: SQ.logFile.path) {
            NSWorkspace.shared.selectFile(SQ.logFile.path, inFileViewerRootedAtPath: SQ.logDir.path)
        } else {
            NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: SQ.logDir.path)
        }
    }

    // MARK: - actions: Game / View

    @objc func openGamePanel(_ sender: NSMenuItem) {
        guard let panel = sender.representedObject as? String else { return }
        let label = sender.title
        game.openPanel(panel) { [weak self] outcome in
            // "no-bridge" just means the page hasn't booted yet — stay silent.
            guard outcome != "no-bridge", outcome != "not-loaded" else { return }
            self?.game.toast("\(label) isn’t available yet")
        }
    }

    @objc func reloadState(_ sender: Any?) { game.reloadState() }

    @objc func zoomActual(_ sender: Any?) { game.setZoom(1.0); PreferencesPanel.shared.sync() }
    @objc func zoomIn(_ sender: Any?) { game.setZoom(game.zoom + 0.25); PreferencesPanel.shared.sync() }
    @objc func zoomOut(_ sender: Any?) { game.setZoom(game.zoom - 0.25); PreferencesPanel.shared.sync() }

    // MARK: - actions: saves (HTTP, then reload the page)

    private func afterSlotChange(_ note: String) {
        game.reload()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            self?.game.toast(note)
        }
    }

    /// A route that simply isn't wired up yet is not an error the user caused, so it
    /// gets a toast rather than a modal. Anything else is a real failure.
    private func fail(_ what: String, _ error: Error) {
        if let api = error as? GameAPI.APIError, api.unavailable {
            NSLog("[menu] %@: route not available yet", what)
            game.toast("\(what) isn’t available yet")
            return
        }
        Alerts.info("\(what) failed", error.localizedDescription, style: .warning)
    }

    @objc func newSave(_ sender: Any?) {
        let (slots, _) = api.slotsSync()
        guard let free = slots.first(where: { !$0.exists })?.slot
                ?? (slots.isEmpty ? 1 : nil) else {
            Alerts.info("All save slots are full",
                        "StudyQuest keeps five saves. Delete one before creating another.",
                        style: .warning)
            return
        }
        guard let name = Alerts.prompt("New Save",
                                       "Name this save. It will go into slot \(free).",
                                       placeholder: "Save \(free)",
                                       initial: "Save \(free)",
                                       confirmTitle: "Create") else { return }
        api.post("/api/slots/create", ["slot": free, "name": name]) { [weak self] result in
            switch result {
            case .success: self?.afterSlotChange("Started “\(name)”")
            case .failure(let e): self?.fail("Creating the save", e)
            }
        }
    }

    @objc func switchSave(_ sender: NSMenuItem) {
        guard let slot = sender.representedObject as? Int else { return }
        api.post("/api/slots/switch", ["slot": slot]) { [weak self] result in
            switch result {
            case .success: self?.afterSlotChange("Loaded slot \(slot)")
            case .failure(let e): self?.fail("Switching save", e)
            }
        }
    }

    @objc func renameSave(_ sender: Any?) {
        let (slots, active) = api.slotsSync()
        let current = slots.first { $0.slot == active }
        guard let name = Alerts.prompt("Rename Save",
                                       "New name for slot \(active).",
                                       placeholder: "Save \(active)",
                                       initial: current?.name ?? "",
                                       confirmTitle: "Rename") else { return }
        api.post("/api/slots/rename", ["slot": active, "name": name]) { [weak self] result in
            switch result {
            case .success: self?.game.toast("Renamed to “\(name)”")
            case .failure(let e): self?.fail("Renaming the save", e)
            }
        }
    }

    @objc func deleteSave(_ sender: Any?) {
        let (slots, active) = api.slotsSync()
        let existing = slots.filter { $0.exists }
        guard !existing.isEmpty else { return }

        // Which one? If there is more than one, ask.
        var target = active
        if existing.count > 1 {
            let a = NSAlert()
            a.messageText = "Delete a Save"
            a.informativeText = "Choose the save to delete. This cannot be undone."
            a.addButton(withTitle: "Continue")
            a.addButton(withTitle: "Cancel")
            let popup = NSPopUpButton(frame: NSRect(x: 0, y: 0, width: 280, height: 26))
            popup.addItems(withTitles: existing.map(\.menuTitle))
            if let idx = existing.firstIndex(where: { $0.slot == active }) { popup.selectItem(at: idx) }
            a.accessoryView = popup
            guard a.runModal() == .alertFirstButtonReturn else { return }
            target = existing[popup.indexOfSelectedItem].slot
        }
        let name = existing.first { $0.slot == target }?.name ?? "Slot \(target)"
        guard Alerts.confirm("Delete “\(name)”?",
                             "Every task, coin and building in this save is erased. "
                             + "This cannot be undone.",
                             confirmTitle: "Delete", destructive: true) else { return }

        api.post("/api/slots/delete", ["slot": target]) { [weak self] result in
            switch result {
            case .success: self?.afterSlotChange("Deleted “\(name)”")
            case .failure(let e): self?.fail("Deleting the save", e)
            }
        }
    }

    // MARK: - actions: import / export

    @objc func importTasks(_ sender: Any?) {
        let panel = NSOpenPanel()
        panel.title = "Import Tasks"
        panel.message = "Choose a syllabus or task list: JSON, CSV, TSV, Markdown checklist, or plain text."
        panel.prompt = "Import"
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        if #available(macOS 11.0, *) {
            panel.allowedContentTypes = [
                UTType.json, UTType.commaSeparatedText, UTType.tabSeparatedText,
                UTType.plainText, UTType.text,
                UTType(filenameExtension: "md") ?? UTType.plainText,
                UTType(filenameExtension: "tsv") ?? UTType.plainText,
            ]
        }
        guard panel.runModal() == .OK, let url = panel.url else { return }

        let text: String
        do {
            text = try String(contentsOf: url, encoding: .utf8)
        } catch {
            Alerts.info("Could not read that file",
                        "\(url.lastPathComponent): \(error.localizedDescription)", style: .warning)
            return
        }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            Alerts.info("Nothing to import", "\(url.lastPathComponent) is empty.", style: .warning)
            return
        }

        let ext = url.pathExtension.lowercased()
        var body: [String: Any] = ["text": text]
        if !ext.isEmpty { body["format"] = ext }   // a hint; the server still auto-detects

        api.post("/api/tasks/import", body) { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let e):
                self.fail("Importing tasks", e)
            case .success(let obj):
                let imported = (obj["imported"] as? NSNumber)?.intValue ?? 0
                let skippedList = obj["skipped"] as? [Any] ?? []
                let skipped = (obj["skippedCount"] as? NSNumber)?.intValue ?? skippedList.count

                var detail = "imported \(imported), skipped \(skipped)"
                if !skippedList.isEmpty {
                    let reasons = skippedList.prefix(8).map { entry -> String in
                        if let d = entry as? [String: Any] {
                            let line = d["line"] as? String ?? d["raw"] as? String ?? ""
                            let why = d["reason"] as? String ?? d["error"] as? String ?? "unparseable"
                            return line.isEmpty ? "• \(why)" : "• \(line) — \(why)"
                        }
                        return "• \(entry)"
                    }.joined(separator: "\n")
                    detail += "\n\n" + reasons
                    if skippedList.count > 8 { detail += "\n• …and \(skippedList.count - 8) more" }
                }
                Alerts.info("Import complete", detail)
                self.game.reload()
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                    self.game.toast("Imported \(imported) task\(imported == 1 ? "" : "s")")
                }
            }
        }
    }

    @objc func exportSave(_ sender: Any?) {
        let (slots, active) = api.slotsSync()
        let name = slots.first { $0.slot == active }?.name ?? "Save \(active)"
        let safe = name.replacingOccurrences(of: "/", with: "-")

        let panel = NSSavePanel()
        panel.title = "Export Save"
        panel.message = "Write the active save to a JSON file."
        panel.nameFieldStringValue = "StudyQuest — \(safe).json"
        if #available(macOS 11.0, *) { panel.allowedContentTypes = [.json] }
        guard panel.runModal() == .OK, let url = panel.url else { return }

        api.get("/api/state") { [weak self] result in
            switch result {
            case .failure(let e):
                self?.fail("Exporting the save", e)
            case .success(let obj):
                let payload = obj["state"] ?? obj
                do {
                    let data = try JSONSerialization.data(
                        withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
                    try data.write(to: url, options: .atomic)
                    self?.game.toast("Exported “\(name)”")
                } catch {
                    self?.fail("Exporting the save", error)
                }
            }
        }
    }
}
