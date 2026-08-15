# Converter — Design Direction

## Three possible approaches

### 1. Signal Ledger
**Very Brief Intro:** A precision-tool aesthetic that treats each conversion as a short, trustworthy transaction. Cool blue interface planes, strong editorial typography, and calm status cues make the app feel dependable rather than decorative.

**Probability:** 0.07

### 2. Studio Workbench
**Very Brief Intro:** A brighter creative-tool workspace with desk-like surfaces, illustrated file artifacts, and a friendly guided flow. It would make an ordinary conversion task feel approachable and tactile.

**Probability:** 0.04

### 3. Tape & Terminal
**Very Brief Intro:** A playful archival interface inspired by media labels and cassette spines. It uses coral stickers, oversized labels, and utilitarian metadata to give file conversion a collectible character.

**Probability:** 0.09

## Chosen approach: Signal Ledger

**Design Movement:** Swiss editorial systems combined with contemporary productivity software.

**Core Principles:**

1. Make the conversion path visually obvious through a strong reading order: source, target, output.
2. Use restrained surfaces and high-contrast type to convey technical reliability without looking corporate.
3. Preserve the existing blue, coral, green, and red accents as semantic signals, not decoration.
4. Offer immediate, honest feedback: private browser processing, live file metadata, and visible completion states.

**Color Philosophy:** Ink navy anchors the interface as a focused workspace. Electric blue is the ownable operational color, while green, coral, and red distinguish successful image transforms, guidance, and capability boundaries. Soft cloud-white panels provide a clear resting surface around files and settings.

**Layout Paradigm:** A left-aligned editorial masthead leads into an asymmetrical workbench. The active conversion space occupies a broad main rail while a narrower right rail explains privacy and output behavior. On mobile, the rails stack in the same reading order.

**Signature Elements:**

1. A segmented conversion rail that shows the path from source format to selected output.
2. A compact “private by design” proof strip that makes browser-only processing visible.
3. Color-coded file-family markers: blue for images, green for browser media, coral for unsupported hosted features.

**Interaction Philosophy:** Interactions are direct and local. Selecting a file immediately populates metadata and an honest in-browser preview. Format changes visibly update the output destination, and unavailable server-dependent actions explain the boundary instead of pretending to work.

**Animation:** Short 160–220ms ease-out transitions support hover, progress, and panel reveals. Conversion success uses a small check-mark rise and a filled status rail. No decorative looping motion; reduced-motion users see the same status changes without movement.

**Typography System:** Space Grotesk supplies assertive display and navigation type. IBM Plex Mono is reserved for format labels, byte counts, and processing states. Body copy uses a measured sans-serif hierarchy with generous line-height; headlines never rely on Inter.

**Brand Essence:** Converter is a private, browser-first file workbench for people who need a clean route from one format to another. **Precise, candid, composed.**

**Brand Voice:** Headlines are factual and decisive; CTAs are action-led; microcopy states constraints plainly. Example lines: “Choose a file. Keep it on this device.” and “Video extraction needs a local converter.” Generic greetings and vague productivity slogans are not used.

**Wordmark & Logo:** A modular mark made from two offset transfer arrows enclosed in a rounded square, suggesting a controlled handoff between formats. The wordmark pairs a condensed “C” rhythm with the mono-format labels, rather than a default font treatment.

**Signature Brand Color:** **Transfer Blue — #2F89F5.**

## Style Decisions

- The source → target → output rail is the primary visual system across hero, workbench, status, and capability areas.
- Generated imagery is framed as labeled format artifacts and deliberately desaturated so it supports the tool rather than becoming decorative gloss.
- The offset transfer-arrow mark is amplified in the header and footer and echoed through mono ledger codes, rails, and semantic success/boundary states.
