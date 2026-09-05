// IconGen — draws the StudyQuest app icon from nothing but CoreGraphics and emits
// a full .iconset. No downloaded art, in keeping with the project's rules.
//
//   usage: sqicon <output.iconset>
//
// The motif is a closed tome laid on a diagonal, lit from behind by a layered
// aura. The book is built from flat-filled polygons — no bitmaps, no textures —
// so it stays crisp at 1024 and still reads as a silhouette at 16.

import AppKit
import CoreGraphics
import Foundation

// MARK: - palette

func hex(_ s: String, _ a: CGFloat = 1) -> CGColor {
    var v: UInt64 = 0
    Scanner(string: s.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
    return CGColor(srgbRed: CGFloat((v >> 16) & 0xff) / 255,
                   green: CGFloat((v >> 8) & 0xff) / 255,
                   blue: CGFloat(v & 0xff) / 255, alpha: a)
}

let gold      = "#ffd93d"
let goldLight = "#fff2a8"
let goldDeep  = "#b8901c"
let purple    = "#a86cff"
let purpleMid = "#7b46c9"
let purpleDim = "#4d2a86"
let blue      = "#4aa3ff"
let page      = "#f4eddc"
let pageDim   = "#b9ad91"
let ground    = "#12141c"
let groundTop = "#1b1e2a"

// MARK: - the book, in local units (x right, y up, origin at the cover's centre)

let bookW: CGFloat  = 1.00      // cover width
let bookH: CGFloat  = 1.30      // cover height
let spineW: CGFloat = 0.20      // spine band on the left
let pageW: CGFloat  = 0.16      // page block on the right
let tilt: CGFloat   = 34 * .pi / 180   // counter-clockwise

let hw = bookW / 2, hh = bookH / 2

/// The cover's four corners, used once to auto-fit the rotated shape.
let extremes: [CGPoint] = [
    CGPoint(x: -hw, y: -hh), CGPoint(x: hw, y: -hh),
    CGPoint(x: hw, y: hh), CGPoint(x: -hw, y: hh),
]

/// Maps local book coordinates into the icon bitmap: rotate, scale to fit, centre.
struct Placement {
    let s: CGFloat, c: CGFloat, sn: CGFloat
    let cx: CGFloat, cy: CGFloat        // icon-space centre
    let lx: CGFloat, ly: CGFloat        // local-space centre of the rotated bbox

    init(fitting box: CGRect, angle: CGFloat) {
        c = cos(angle); sn = sin(angle)
        var minX = CGFloat.infinity, maxX = -CGFloat.infinity
        var minY = CGFloat.infinity, maxY = -CGFloat.infinity
        for p in extremes {
            let rx = p.x * cos(angle) - p.y * sin(angle)
            let ry = p.x * sin(angle) + p.y * cos(angle)
            minX = min(minX, rx); maxX = max(maxX, rx)
            minY = min(minY, ry); maxY = max(maxY, ry)
        }
        s = min(box.width / (maxX - minX), box.height / (maxY - minY))
        cx = box.midX; cy = box.midY
        lx = (minX + maxX) / 2; ly = (minY + maxY) / 2
    }

    func map(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
        let rx = x * c - y * sn - lx
        let ry = x * sn + y * c - ly
        return CGPoint(x: cx + rx * s, y: cy + ry * s)
    }

    /// An axis-aligned local rectangle, as a rotated quad in icon space.
    func quad(_ x0: CGFloat, _ y0: CGFloat, _ x1: CGFloat, _ y1: CGFloat) -> [CGPoint] {
        [map(x0, y0), map(x1, y0), map(x1, y1), map(x0, y1)]
    }
}

func path(_ pts: [CGPoint]) -> CGPath {
    let p = CGMutablePath()
    p.addLines(between: pts)
    p.closeSubpath()
    return p
}

func fill(_ ctx: CGContext, _ p: CGPath, _ color: CGColor) {
    ctx.addPath(p)
    ctx.setFillColor(color)
    ctx.fillPath()
}

func fill(_ ctx: CGContext, _ pts: [CGPoint], _ color: CGColor) {
    fill(ctx, path(pts), color)
}

/// Monotone-chain hull — turns the cover's corners plus their extruded copies
/// into one solid silhouette, so the keyline traces the tome and not two rectangles.
func convexHull(_ input: [CGPoint]) -> CGPath {
    let pts = input.sorted { $0.x == $1.x ? $0.y < $1.y : $0.x < $1.x }
    func cross(_ o: CGPoint, _ a: CGPoint, _ b: CGPoint) -> CGFloat {
        (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
    }
    func chain(_ seq: [CGPoint]) -> [CGPoint] {
        var out: [CGPoint] = []
        for p in seq {
            while out.count >= 2 && cross(out[out.count - 2], out[out.count - 1], p) <= 0 {
                out.removeLast()
            }
            out.append(p)
        }
        out.removeLast()
        return out
    }
    return path(chain(pts) + chain(pts.reversed()))
}

// MARK: - aura

/// One radial pass. `stops` are (position, alpha) along the radius.
func aura(_ ctx: CGContext, _ cs: CGColorSpace, at p: CGPoint, radius: CGFloat,
          color: String, gain: CGFloat = 1, stops: [(CGFloat, CGFloat)]) {
    let colors = stops.map { hex(color, $0.1 * gain) } as CFArray
    let locs = stops.map { $0.0 }
    guard let g = CGGradient(colorsSpace: cs, colors: colors, locations: locs) else { return }
    ctx.drawRadialGradient(g, startCenter: p, startRadius: 0,
                           endCenter: p, endRadius: radius, options: [])
}

// MARK: - rendering

func renderIcon(size: Int) -> CGImage? {
    let cs = CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                              bytesPerRow: 0, space: cs,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return nil }

    let s = CGFloat(size)
    let tiny = size < 40            // 16 and 32: silhouette only, no fine detail
    // Small icons need a bigger, harder motif and a quieter aura, or the two
    // dissolve into each other. Large ones can afford air around the book.
    let micro = size < 24           // 16px: three bands and nothing else
    let boxInset: CGFloat = micro ? 0.085 : (tiny ? 0.160 : (size < 96 ? 0.195 : 0.215))
    let glowGain: CGFloat = micro ? 0.34 : (tiny ? 0.62 : (size < 96 ? 0.82 : 1.0))
    ctx.setAllowsAntialiasing(true)
    ctx.interpolationQuality = .high
    ctx.clear(CGRect(x: 0, y: 0, width: s, height: s))

    // ── the rounded tile, inset the way macOS icons are ──────────────────────
    let inset = s * 0.055
    let tile = CGRect(x: inset, y: inset, width: s - inset * 2, height: s - inset * 2)
    let radius = tile.width * 0.225
    let tilePath = CGPath(roundedRect: tile, cornerWidth: radius, cornerHeight: radius,
                          transform: nil)

    ctx.saveGState()
    ctx.addPath(tilePath)
    ctx.clip()

    if let g = CGGradient(colorsSpace: cs,
                          colors: [hex(groundTop), hex(ground)] as CFArray,
                          locations: [0, 1]) {
        ctx.drawLinearGradient(g, start: CGPoint(x: 0, y: tile.maxY),
                               end: CGPoint(x: 0, y: tile.minY), options: [])
    }

    // ── the aura: four concentric passes, wide and cool through to hot core ──
    //
    // Centred slightly above the geometric middle so the light reads as coming
    // from behind the book's upper half and pooling downward.
    let glowC = CGPoint(x: tile.midX - tile.width * 0.05, y: tile.midY + tile.height * 0.07)
    let W = tile.width

    // 1. the far field — purple bleeding into the dark ground
    aura(ctx, cs, at: glowC, radius: W * 0.86, color: purple, gain: glowGain,
         stops: [(0.00, 0.34), (0.34, 0.25), (0.62, 0.11), (0.84, 0.035), (1.00, 0.0)])
    // 2. the mid body — brighter purple, tighter falloff
    aura(ctx, cs, at: glowC, radius: W * 0.58, color: purple, gain: glowGain,
         stops: [(0.00, 0.48), (0.40, 0.31), (0.76, 0.10), (1.00, 0.0)])
    // 3. the warm shoulder — where purple turns gold
    aura(ctx, cs, at: glowC, radius: W * 0.46, color: "#dda6ff", gain: glowGain,
         stops: [(0.00, 0.50), (0.42, 0.28), (0.78, 0.08), (1.00, 0.0)])
    // 4. the core — gold, wide enough to spill past the book's edges
    aura(ctx, cs, at: glowC, radius: W * 0.38, color: gold, gain: glowGain,
         stops: [(0.00, 0.64), (0.40, 0.42), (0.74, 0.15), (1.00, 0.0)])
    aura(ctx, cs, at: glowC, radius: W * 0.24, color: goldLight, gain: glowGain,
         stops: [(0.00, 0.60), (0.50, 0.28), (1.00, 0.0)])

    // A vignette pulls the corners back down to the ground colour. Without it the
    // aura reads as an overall purple haze instead of as light with a source.
    aura(ctx, cs, at: CGPoint(x: tile.midX, y: tile.midY), radius: W * 0.82, color: ground,
         stops: [(0.00, 0.0), (0.42, 0.0), (0.72, 0.30), (1.00, 0.62)])

    // ── motes of light, sparse and deliberately off-balance ─────────────────
    // Placed in the open corners either side of the book's long axis.
    if !tiny {
        let motes: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [   // x, y, radius, alpha
            ( 0.395,  0.250, 0.021, 1.00),
            ( 0.315,  0.428, 0.013, 0.72),
            ( 0.462, -0.045, 0.015, 0.85),
            (-0.352, -0.396, 0.018, 0.92),
            (-0.455, -0.118, 0.011, 0.60),
            (-0.196, -0.470, 0.013, 0.70),
        ]
        for (mx, my, mr, ma) in motes {
            let p = CGPoint(x: tile.midX + mx * W, y: tile.midY + my * W)
            let r = mr * W
            aura(ctx, cs, at: p, radius: r * 4.2, color: gold,
                 stops: [(0.0, 0.34 * ma), (0.45, 0.12 * ma), (1.0, 0.0)])
            // a hard little diamond in the middle keeps it pixel-art-adjacent
            fill(ctx, [CGPoint(x: p.x, y: p.y + r), CGPoint(x: p.x + r, y: p.y),
                       CGPoint(x: p.x, y: p.y - r), CGPoint(x: p.x - r, y: p.y)],
                 hex(goldLight, 0.92 * ma))
        }
    }

    // ── the book ────────────────────────────────────────────────────────────
    // Content box: well inside the macOS safe area, so the aura has room to breathe.
    let box = tile.insetBy(dx: W * boxInset, dy: tile.height * boxInset)
    let P = Placement(fitting: box, angle: tilt)

    let lw = max(1, s * 0.0095)

    // At 16px the three bands have barely a pixel each, so widen them: better a
    // slightly stubby book that reads than a faithful one that turns to soup.
    let sw: CGFloat = micro ? 0.30 : (tiny ? 0.26 : spineW)
    let pw: CGFloat = micro ? 0.28 : (tiny ? 0.19 : pageW)

    // The cover's corners, and the same corners pushed down-right: the tome's
    // thickness is an extrusion in screen space, so it always falls away from
    // the light no matter how the book is tilted.
    let face = P.quad(-hw, -hh, hw, hh)          // BL, BR, TR, TL in local terms
    let dep: CGFloat = micro ? 0.0 : 1.0
    let d = CGSize(width: s * 0.026 * dep, height: -s * 0.030 * dep)
    func push(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x + d.width, y: p.y + d.height) }
    let back = face.map(push)
    let hull = convexHull(face + back)

    // A pool of shadow under the whole tome so it sits *in* the light, not on it.
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: -s * 0.008, height: -s * 0.026),
                  blur: s * 0.055, color: hex("#07080f", micro ? 0.8 : 0.62))
    fill(ctx, hull, hex(purpleDim))
    ctx.restoreGState()

    if !micro {
        fill(ctx, hull, hex(purpleDim))
        // The two extruded sides that face the viewer: the book's bottom board
        // and its fore-edge (which is page, so: cream).
        fill(ctx, [face[0], face[1], back[1], back[0]], hex(purpleDim))
        fill(ctx, [face[1], face[2], back[2], back[1]], hex(pageDim))
    }

    // Front cover. At micro sizes it goes straight to the bright purple, which
    // is the only value that separates cleanly from the aura behind it.
    fill(ctx, path(face), hex(micro ? purple : purpleMid))
    if !micro {
        // Cover sheen: a lighter wedge across the upper half of the face.
        fill(ctx, P.quad(-hw, 0.00, hw, hh), hex(purple, 0.60))
    }

    // Spine, and its highlight rule.
    fill(ctx, P.quad(-hw, -hh, -hw + sw, hh), hex(tiny ? "#3a1f6b" : purpleDim))
    if !tiny {
        fill(ctx, P.quad(-hw + sw, -hh, -hw + sw + 0.040, hh), hex(blue, 0.90))
    }

    // Page block on the right — the third big separable shape.
    let pin: CGFloat = micro ? 0.0 : 0.05
    fill(ctx, P.quad(hw - pw, -hh + pin, hw, hh - pin), hex(page))
    if !micro {
        fill(ctx, P.quad(hw - pw, -hh + pin, hw - pw + 0.042, hh - pin), hex(pageDim))
    }

    if !tiny {
        // A few leaves in the page block. Bold enough to survive 64px, gone below 40.
        for i in 0..<3 {
            let y = -0.40 + CGFloat(i) * 0.40
            fill(ctx, P.quad(hw - pw + 0.062, y, hw - 0.024, y + 0.042), hex(pageDim, 0.8))
        }
    }

    // Gold gem emblem on the cover: lit from above, shaded below. Dropped at 16px,
    // where it would swallow the whole cover and leave a yellow blob.
    if micro {
        // One gold pixel keeps the family resemblance at 16px; a full gem here
        // would swallow the cover.
        let er: CGFloat = 0.15
        fill(ctx, [P.map(0, er * 1.3), P.map(er, 0), P.map(0, -er * 1.3), P.map(-er, 0)],
             hex(gold))
    } else {
        let er: CGFloat = tiny ? 0.19 : 0.23
        let gT = P.map(0, er * 1.15), gR = P.map(er, 0)
        let gB = P.map(0, -er * 1.15), gL = P.map(-er, 0)
        // The gem is where the aura comes from, so it gets its own small bloom.
        if !tiny {
            aura(ctx, cs, at: P.map(0, 0), radius: P.s * er * 3.4, color: gold,
                 stops: [(0.0, 0.34), (0.35, 0.18), (1.0, 0.0)])
        }
        fill(ctx, [gT, gR, gB, gL], hex(gold))
        fill(ctx, [gL, gB, gR], hex(goldDeep, 0.55))                 // shaded lower facets
        if !tiny {
            fill(ctx, [gT, P.map(er * 0.34, er * 0.42), P.map(-er * 0.34, er * 0.42)],
                 hex(goldLight, 0.85))                               // the catch-light facet
            ctx.addPath(path([gT, gR, gB, gL]))
            ctx.setStrokeColor(hex("#6d5510", 0.55))
            ctx.setLineWidth(lw * 0.6)
            ctx.strokePath()
        }
    }

    // ── contour: a dark keyline so the book never dissolves into its own glow ─
    ctx.addPath(hull)
    if !micro { ctx.addPath(path(face)) }
    ctx.setStrokeColor(hex("#221739", micro ? 0.8 : 0.95))
    ctx.setLineWidth(lw * (tiny ? 0.8 : 0.95))
    ctx.setLineJoin(.miter)
    ctx.strokePath()

    // ── rim light where the aura catches the top-left edges ─────────────────
    if !tiny {
        ctx.setLineCap(.round)
        ctx.setLineWidth(lw * 1.05)
        ctx.setStrokeColor(hex(goldLight, 0.95))
        ctx.beginPath()
        ctx.addLines(between: [P.map(-hw, hh), P.map(hw, hh)])          // top edge
        ctx.strokePath()
        ctx.setLineWidth(lw * 0.8)
        ctx.setStrokeColor(hex(gold, 0.28))
        ctx.beginPath()
        ctx.addLines(between: [P.map(-hw, -hh), P.map(-hw, hh)])        // spine edge
        ctx.strokePath()
    }

    // A last unifying bloom so the book sits inside the light, not in front of it.
    aura(ctx, cs, at: glowC, radius: W * 0.50, color: gold, gain: glowGain,
         stops: [(0.0, 0.11), (0.5, 0.055), (1.0, 0.0)])

    ctx.restoreGState()

    // A one-unit hairline border in the blue, at 30%.
    ctx.saveGState()
    ctx.addPath(tilePath)
    ctx.setStrokeColor(hex(blue, 0.30))
    ctx.setLineWidth(max(1, s / 128))
    ctx.strokePath()
    ctx.restoreGState()

    return ctx.makeImage()
}

func write(_ image: CGImage, to url: URL) throws {
    let rep = NSBitmapImageRep(cgImage: image)
    rep.size = NSSize(width: image.width, height: image.height)
    guard let data = rep.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "sqicon", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "PNG encoding failed"])
    }
    try data.write(to: url)
}

// MARK: - main

let args = CommandLine.arguments
guard args.count >= 2 else {
    FileHandle.standardError.write(Data("usage: sqicon <output.iconset>\n".utf8))
    exit(2)
}
let out = URL(fileURLWithPath: args[1])
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

// name -> pixel size, the exact set iconutil expects.
let variants: [(String, Int)] = [
    ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
]

for (name, size) in variants {
    guard let img = renderIcon(size: size) else {
        FileHandle.standardError.write(Data("sqicon: could not render \(size)px\n".utf8))
        exit(1)
    }
    do { try write(img, to: out.appendingPathComponent(name)) }
    catch {
        FileHandle.standardError.write(Data("sqicon: \(name): \(error.localizedDescription)\n".utf8))
        exit(1)
    }
}
print("sqicon: wrote \(variants.count) images to \(out.path)")
