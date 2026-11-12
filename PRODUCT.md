# Product Context: Minimal Board Tab (Arc Organiser)

> Source of truth for product goals, audience, core workflows, constraints, and design principles. Initialized via Impeccable.

---

## 1. Vision & Purpose

**Minimal Board Tab** is a fast, calm, keyboard-first visual bookmark and tab manager for Chromium browsers. It acts as a local-first, privacy-respecting, zero-subscription alternative to tools like Markmez, Toby, and Raindrop.

- **Primary Goal:** Prevent tab overload without losing context, allowing users to capture links silently, organize visually across boards and workspaces, and find anything in milliseconds.
- **Philosophy:** Local-first, zero-build vanilla web architecture, user-owned data, zero tracking, and instant load time.

---

## 2. Target Audience & Personas

- **Tab Hoarders & Heavy Browser Users:** People who regularly keep dozens or hundreds of tabs open because bookmarking feels like a black hole and closing tabs causes anxiety.
- **Developers, Researchers & Power Users:** Keyboard-oriented users who value command palettes, instant shortcut capture (`Alt+Shift+S`), clean JSON/Markdown backups, and zero-latency workflows.
- **Privacy & Local-First Advocates:** Users who avoid cloud subscription lock-in, proprietary syncing servers, or accounts for basic new-tab productivity.

---

## 3. Core Workflows (Jobs To Be Done)

1. **Silent, Low-Friction Tab Capture:**
   - Single shortcut (`Alt+Shift+S`) captures the current tab into an Inbox or designated column with zero UI intrusion.
   - Whole-window tab capture into session columns in one click.
2. **Visual Spatial Organization:**
   - Drag-and-drop board layout with custom columns, boards, and nested spaces.
   - Bento-style overview cards with clear visual hierarchy.
3. **Instant Keyboard Navigation & Search:**
   - Dedicated search palette (`/` or `Cmd/Ctrl+K`) supporting instant fuzzy search, operators (`tag:`, `domain:`, `is:unread`), and active tab switching.
4. **Session & Triage Management:**
   - Rapid keyboard triage mode to cycle through unsorted items and archive, organize, or purge.
   - Crash recovery and saved window snapshots.
5. **Zero-Server Sync & Portability:**
   - Export/import via open standards (HTML Bookmarks, JSON).
   - Account-free file sync through user-owned cloud drives (Dropbox, iCloud Drive, Syncthing, OneDrive) with optional client-side encryption.

---

## 4. Design Principles & Aesthetic Direction

1. **Calm by Default, Powerful on Demand:**
   - Advanced features remain tucked away until invoked. The default new tab surface must be tranquil, spacious, and clutter-free.
2. **Anti-Slop / Purposeful Visual System:**
   - Avoid generic AI aesthetic cliches (such as default purple-on-black neon gradients, indiscriminate glassmorphism, or flat unstyled cards).
   - Use cohesive Material You / Apple fluid design foundations:
     - Dynamic tonal color system derived from the background/wallpaper.
     - Strict 8pt spacing grid (8px, 16px, 24px, 32px) and disciplined typography hierarchy.
     - Natural spring transitions (`cubic-bezier(0.2, 0.9, 0.3, 1.15)`) and tactile micro-interactions.
3. **Speed is a Feature:**
   - Near-instant cold start (< 100ms budget). Zero layout shifts (CLS = 0) on new tab instantiation.

---

## 5. Technical Constraints & Platform Boundaries

- **Platform:** Chromium Manifest V3 browser extension (Chrome, Brave, Edge, Opera, Vivaldi; Arc best-effort).
- **Runtime:** Vanilla JavaScript (ES modules), native HTML5 & CSS3.
- **Build Step:** Zero build pipeline required for running the extension. Local bundled assets only (no remote CDNs for scripts, styles, or fonts).
- **Permissions:** Restricted strictly to declared MV3 capabilities (`storage`, `tabs`, `favicon`, `contextMenus`, `alarms`).
- **Network Rule:** Absolutely zero outbound network calls by default; fully functional offline.
