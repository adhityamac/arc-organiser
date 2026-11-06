# Minimal Board Tab: Product Requirements Document (v2.0)

*Personal Visual Bookmark & Tab Manager · Enhanced edition · November 2026 · Status: Step 1 complete, Step 2 in progress · Competitive reference: Markmez (markmez.com)*

## 1. Executive Summary & Vision

**Product:** Minimal Board Tab, a free, local-first alternative to Markmez.

**Target environment:** Chromium browsers (Brave, Chrome, Edge, Opera, Vivaldi) via Manifest V3. Arc is best-effort until its new-tab override behavior is verified.

**Architecture philosophy:** Local-first, zero-build vanilla JavaScript, zero external dependencies, near-instant New Tab load.

**Core problem solved:** Tabs pile up because closing one feels like losing it, and bookmark folders hide links out of sight. Paid or cloud-based managers (Markmez, Toby, Raindrop) add subscriptions, accounts, or weight to the page you open dozens of times a day.

**Core value proposition:** A keyboard-first New Tab board that captures tabs silently from anywhere (Alt+Shift+S), organizes them across workspaces and columns with drag-and-drop, finds anything instantly through a command palette, and keeps every byte on your machine with open, portable backups.

**Positioning against Markmez:** Markmez shows that people will pay for a calm, board-based new tab. We match that promise (boards, quick save, import, wallpapers, widgets, export) and compete on what a paid, account-based product cannot easily offer: free forever, no license key or sign-in, local-first speed, power tools for heavy users (triage mode, auto-sort rules, search operators, sessions), and fully user-owned data.

**Design principles**

1. Capture in under a second, with no UI in the way.
2. Speed is a feature: every feature ships with a performance budget.
3. Keyboard first, mouse friendly, accessible always.
4. Your data lives in your browser and your files. There are no servers.
5. Calm by default, powerful on demand: advanced features stay out of sight until used.
6. No network requests unless the user turns a feature on.

## 2. Competitive Analysis

### 2.1 What Markmez offers (from its website, November 2026)

- Visual boards with drag-and-drop, unlimited boards, and nested pages.
- One-shortcut Quick Save of tabs, links, and notes, with instant search over everything saved.
- Cross-device sync through a signed-in account.
- Import of existing browser bookmarks; export at any time.
- Wallpapers and minimal widgets (clock, quick search).
- English, German, and Russian interface; Chrome, Edge, Opera, Brave, and Yandex Browser.
- Business model: paid license key (launch pricing of $9 for one year or $25 lifetime, 7-day refund), activated after an emailed install link.

### 2.2 Where we can win

- **Price and friction:** free, with no purchase, key, email step, or sign-in.
- **Migration pain:** one Markmez customer testimonial calls moving 300+ bookmarks into boards “a bit of work”. We answer with smart import, auto-sort rules, and a keyboard triage mode.
- **Sync without accounts:** instead of a cloud login, a user-owned Sync Folder (Dropbox, iCloud Drive, OneDrive, Syncthing) with optional end-to-end encryption.
- **Search depth:** operators, saved views, open-tab switching, and a command palette.
- **Tab management, not just bookmarking:** sessions, tab groups, duplicate-tab cleanup, and crash recovery.
- **Privacy by construction:** no outbound requests by default and a local favicon source.

### 2.3 Parity checklist (all required before this counts as an alternative)

- Visual boards, unlimited boards, nested pages → FR-2.x, FR-3.x
- Quick Save of tabs, links, and notes → FR-1.x, FR-4.5
- Instant search → FR-5.x
- Bookmark import and export → FR-6.1 to FR-6.5
- Wallpapers and widgets → FR-7.2, FR-7.3
- Sync across devices → FR-6.6 to FR-6.8 (Sync Folder, a deliberate account-free design)
- Multi-browser support → Chromium-wide by design
- Localization → FR-7.5

### 2.4 Ideas borrowed from adjacent tools

- Toby, OneTab: collapse a whole window into a saved list in one click.
- Session Buddy: session history and crash recovery.
- Raindrop.io: tags, filters, saved searches, multiple view layouts, bulk edit.
- Workona: workspaces tied to live tabs, and a tab switcher.
- Momentum, Tabliss: calm, personal new-tab styling.

## 3. Goals, Non-Goals & Success Metrics

### 3.1 Goals

- Replace Markmez and tab-hoarding habits for personal use at zero cost.
- Capture a tab in under 100 ms with zero UI.
- Stay fast with 10,000+ saved cards.
- Make “I know I saved that” findable in under 3 seconds.
- Never lose data: undo, trash, rolling snapshots, and portable backups.

### 3.2 Non-goals (strict)

- No React, Vite, Webpack, or npm build step; no runtime dependencies. Development-time tests use only Node’s built-in test runner.
- No backend servers, Firebase/Supabase auth, accounts, or paid cloud sync.
- No telemetry or analytics; all metrics are measured locally.
- No AI or LLM features that send data off the device.
- No mobile app and no Firefox/Safari port in v1.
- No team collaboration or public sharing server (static HTML export only).

### 3.3 Success metrics (measured locally)

- Performance budgets in Section 5.6 are met.
- Median number of open tabs drops by at least 50% within 30 days of daily use.
- Median Inbox card age stays under 14 days.
- Zero data-loss incidents, with a backup restore verified monthly.

## 4. Users & Key Scenarios

**Primary user:** a heavy browser user with 30+ open tabs, hundreds of legacy bookmarks, and a privacy-first mindset (initially, the author).

1. **Close it, keep it:** press Alt+Shift+S; the tab is saved and (optionally) closed.
2. **Where was that?:** press / on a new tab, type three letters, press Enter.
3. **Context switch:** jump to the Work workspace; save the current window as a session before lunch.
4. **Clear the backlog:** triage 200 Inbox cards from the keyboard in about ten minutes.
5. **New machine:** install, restore a backup or connect the sync folder, and be productive in two minutes.

## 5. Technical Architecture

### 5.1 Stack & constraints (retained from v1.0)

- Chrome Extension Manifest V3; the service worker is an ES module (background.js with type: module).
- Semantic HTML5, modern CSS (Grid, Flexbox, custom properties, content-visibility), vanilla ES2022 JavaScript.
- chrome.storage.local with the unlimitedStorage permission is the system of record. IndexedDB holds only binary or bulk data (wallpapers, thumbnails, backup snapshots).
- chrome.storage.onChanged keeps the service worker and open New Tab pages in sync in real time.
- No bundler: files are served exactly as written.

### 5.2 Module layout

```
manifest.json
background.js        service worker: commands, capture, badges, context menus, alarms
newtab.html / .css / .js
options.html / .js   settings, rules, backups, privacy screen
lib/store.js         storage access, Web Lock transactions, migrations
lib/url.js           validate, normalize, tracking-param stripping
lib/search.js        fuzzy scoring and query operators
lib/dnd.js           drag-and-drop engine
lib/merge.js         import and sync merge logic
lib/ui/*.js          board, card, modal, palette, drawer, widgets
_locales/            chrome.i18n message catalogs
tests/*.test.mjs     node --test, pure modules only
```

### 5.3 Storage architecture: what changes from v1.0 and why

- **Problem:** v1.0 keeps one appState blob. Every drag, edit, or quick-save would rewrite all of it, cost grows with library size (thousands of cards parsed on every New Tab open), and two contexts (service worker and New Tab) can overwrite each other’s changes.
- **Fix:** split state into small shards: meta (settings, workspace tree, rules, saved views), ws:\<id> (column layout and ordered card-ID lists), cards:\<id> (card map per workspace), and trash. A New Tab load reads only meta plus the active workspace’s two shards; moves and reorders rewrite only the small layout shard.
- Cards live once, in a map; columns hold ordered ID lists. Moves become cheap, objects are never duplicated, and merges get simpler.
- **Timing:** this lands in Step 2, because Step 3 drag-and-drop persistence depends on it and a later migration costs more.
- **Migrations:** schemaVersion plus ordered migration functions. v1→v2 converts the original appState. A snapshot is taken before any migration, and a write is aborted if validation fails.

### 5.4 Concurrency & reactivity

- Every write goes through store.transaction(fn): take a Web Lock (navigator.locks.request, shared by the service worker and every New Tab page), read the current shards, apply fn, bump meta.rev, and write all changed keys in a single chrome.storage.local.set call. Concurrent writers queue instead of clobbering each other.
- Each context stamps writes with a lastWriter ID so onChanged handlers can ignore their own echoes and re-render only the shards that changed (diff by key, not a full redraw).
- Service worker rules: assume no module-level state survives; register all listeners synchronously at top level; rebuild state from storage on every event; use a short setTimeout only for cosmetic work such as clearing the badge.

### 5.5 Permissions (least privilege)

- **At install:** storage, unlimitedStorage, tabs (titles and URLs for capture and the drawer), favicon (local \_favicon API), contextMenus, alarms.
- **Optional, requested at point of use with an explanation:** bookmarks (import), tabGroups (Open All as a group), downloads (scheduled backups), search (web-search fallback), topSites, and host permissions (link health, title fetch).
- **Later (Step 10):** activeTab and scripting, for thumbnails and metadata of the page the user just invoked.
- **Shortcuts (Chrome allows four suggested defaults):** Alt+Shift+S quick-save, Alt+Shift+A save window, Alt+Shift+B open board, one spare. All remappable at chrome://extensions/shortcuts (brave://extensions/shortcuts in Brave).

### 5.6 Performance plan

**Budgets**

- Board first paint after document start: p50 ≤ 15 ms at ≤ 500 cards, p95 ≤ 50 ms at 5,000 cards. The original 15 ms goal is kept as the p50 target, measured with performance.mark and a ?perf=1 overlay.
- Quick-save, keypress to badge: ≤ 100 ms.
- Search keystroke to painted results: ≤ 16 ms at 10,000 cards (pre-lowercased search string per card, linear scan, no debounce needed).
- Drag: dragover handler ≤ 4 ms; 60 fps in a 500-card column.
- Memory ≤ 25 MB per New Tab at 2,000 cards; total shipped JS and CSS ≤ 150 KB.
- Import of 1,000 bookmarks ≤ 2 s.

**Techniques**

- Inline critical CSS in newtab.html, load the script as a deferred module, and paint a skeleton immediately. Render only the active workspace; defer widgets, wallpaper decoding, and settings UI until after first paint.
- Event delegation (one listener per event type on the board), DocumentFragment batch rendering, content-visibility: auto with contain-intrinsic-size on cards, and chunked rendering of very long columns via IntersectionObserver.
- Favicons use loading=lazy, decoding=async, and fixed dimensions to avoid layout shift.
- A synthetic data generator (1k, 5k, 10k cards) drives repeatable benchmarks.

### 5.7 Security & privacy

- Page titles and URLs are untrusted input. Render with textContent and DOM APIs only, never innerHTML; Markdown-lite notes pass through a small whitelist renderer.
- Open and import only http: and https: URLs (file: only if enabled). Reject javascript:, data:, and blob:. Use rel=noopener noreferrer.
- Keep the default extension CSP: no inline scripts, no eval, no remote code.
- Import validation: schema check, size cap, and ID regeneration on merge collisions.
- **Favicons:** default to the local \_favicon API with a generated letter tile as fallback. The Google S2 service (which discloses visited hostnames to a third party) becomes an explicit opt-in. This replaces the v1.0 default.
- Incognito tabs are never captured unless the user opts in.
- A Privacy screen lists the permissions in use and states that nothing leaves the device unless an optional feature is enabled.

## 6. Data Model v2

```
meta                      one key, read on every load
  schemaVersion: 2
  rev: integer            incremented on every transaction
  lastWriter: string      context id, used to ignore echo events
  activeWorkspaceId
  workspaces[]: { id, parentId|null, name, icon, order, wallpaperId? }
  settings: { theme: dark|light|auto, accent, cardDensity, viewMode,
              closeTabOnQuickSave, openLinksInNewTab,
              dedupeScope: inbox|workspace|all, stripTrackingParams,
              faviconSource: browser|google|none, includePinnedInSession,
              toolbarClickAction: save-tab|save-window|open-board,
              trashRetentionDays, staleAfterDays, widgets[] }
  rules[]: { id, match: { host?, urlContains?, titleContains?, tag? },
             toColumn, addTags[] }
  savedViews[]: { id, name, query }
  lastAction: { type, ids[], at }      powers Undo for captures

ws:<workspaceId>          layout shard, small, rewritten on every move
  columnOrder: [columnId]
  columns: { [id]: { id, title, color, emoji?, collapsed, sort,
                     system?: inbox|archive, cardIds: [cardId] } }

cards:<workspaceId>       content shard, one map per workspace
  { [cardId]: { id, type: link|note, title, url?, nurl?, host?, body?,
                note, tags[], pinned, color?, faviconUrl?, thumbId?,
                createdAt, updatedAt, lastOpenedAt, openCount } }

trash                     capped list, pruned after retention
  [ { card, workspaceId, columnId, index, deletedAt } ]

IndexedDB (binary and bulk data, not chrome.storage)
  blobs: wallpapers, thumbnails      snapshots: rolling backups
```

**Notes**

- IDs come from crypto.randomUUID(). Timestamps are epoch milliseconds, and updatedAt changes on every mutation so merges can resolve conflicts.
- nurl is the normalized URL used for duplicate detection and search; host is derived from it.
- The favicon field is gone. v1.0 stored a Google S2 URL per card; v2 derives the icon at render time from the local favicon API, and faviconUrl keeps the tab-provided icon as a fallback.
- Nested pages are workspaces with a parentId. Note cards have type note and no URL.

## 7. Functional Requirements

Priorities: **P0** = needed for v1.0 daily-driver release; **P1** = Markmez parity and power features; **P2** = polish and stretch. Original v1.0 requirement IDs are preserved and strengthened.

### 7.1 Capture & background (background.js)

- **FR-1.1 \[P0\] Global Quick-Save (Alt+Shift+S):** on an http(s) tab, silently capture title and URL and prepend a card to the active workspace’s Inbox. Skip chrome://, chrome-extension://, about:, devtools pages, and the board itself. Incognito tabs are never captured by default. Failures show a red ✗ badge instead of failing silently.
- **FR-1.2 \[P0\] Duplicate prevention:** compare normalized URLs (lowercase host, drop www., fragment, trailing slash, and utm\_\*, fbclid, gclid when enabled). Scope is configurable: Inbox, workspace (default), or everywhere. On a duplicate, show an amber DUP badge, set updatedAt, and move the existing card to the top of its column; never create a second card.
- **FR-1.3 \[P0\] Badge feedback:** green ✓ for 1.5 seconds on success, amber DUP, red ✗ on failure, and a numeric count after multi-tab saves. No popup.
- **FR-1.4 \[P0\] Save & Close mode:** when enabled, close the tab only after the write is confirmed. If it is the last tab in the window, open a New Tab first so the window survives.
- **FR-1.5 \[P0\] Save window session (Alt+Shift+A):** capture all unpinned http(s) tabs of the current window into a new column named “Session · YYYY-MM-DD HH:mm”. Pinned tabs are optional via settings. The toolbar-icon action is configurable (save tab, save window, or open board) and defaults to save tab, so an accidental click never grabs 40 tabs. With Save & Close, ask for confirmation above 30 tabs.
- **FR-1.6 \[P1\] Context menu:** Save page, Save link, Save selection as note, and Save to ▸ workspace ▸ column.
- **FR-1.7 \[P1\] Save selected tabs and all windows:** support highlighted tabs and a whole-browser capture.
- **FR-1.8 \[P1\] Auto-sort at capture:** apply auto-sort rules (FR-8.3) so cards land in the right column and get tags immediately.
- **FR-1.9 \[P1\] Undo capture:** record each capture batch in meta.lastAction so it can be reverted from a toast on the New Tab page or the palette (“Undo last save”) for 10 minutes.
- **FR-1.10 \[P2\] Rich capture (opt-in):** for the page the user just invoked, store a small WebP thumbnail (via captureVisibleTab, kept in IndexedDB) and the meta description.

### 7.2 Board & column management (newtab.js)

- **FR-2.1 \[P0\] Multi-column grid:** responsive layout with independent vertical scrolling per column, horizontal scroll with snap, and sticky column headers.
- **FR-2.2 \[P0\] Full column CRUD:** create (“+ Add Column”), rename inline (double-click; Enter or blur saves, Esc cancels), and delete (confirm when non-empty, with the choice to move cards to Inbox or send them to trash). “Open All (N)” opens every link, as a tab group named after the column when tabGroups is granted, and asks for confirmation above 20 links.
- **FR-2.3 \[P0\] Workspaces:** top pill switcher for multiple boards (Personal, Work, Side Projects); quick switch with \[ and \] and from the palette.
- **FR-2.4 \[P1\] Nested pages:** workspaces can contain child pages (up to 3 levels) in a collapsible sidebar tree, matching Markmez’s nested pages.
- **FR-2.5 \[P1\] Column options:** color, emoji, collapse, sort (manual, newest, A–Z, domain), duplicate, and archive.
- **FR-2.6 \[P1\] Special Inbox column:** cannot be deleted, shows a card count, and highlights cards older than staleAfterDays (default 14), which feeds triage mode.
- **FR-2.7 \[P2\] View modes:** Board (kanban), List (dense single list), and Gallery (thumbnails).

### 7.3 Drag-and-drop engine (native HTML5 API)

- **FR-3.1 \[P0\] Reorder and move:** drag cards vertically within a column or across columns, using delegated listeners on the board container.
- **FR-3.2 \[P0\] Drop indicator:** a ghost line shows the landing position, computed in requestAnimationFrame from cached rectangles to avoid layout thrash.
- **FR-3.3 \[P0\] Column reordering:** drag column headers by a handle.
- **FR-3.4 \[P0\] Edge auto-scroll:** scroll the board or column automatically when dragging near its edge (native drag-and-drop does not do this reliably).
- **FR-3.5 \[P0\] Keyboard alternative:** Alt+Arrow keys move a focused card, and m opens a Move-to picker. Dragging must never be the only way to reorder (WCAG 2.2, SC 2.5.7).
- **FR-3.6 \[P0\] Safe persistence:** one transaction on drop, optimistic UI with rollback on failure, and Esc cancels an in-progress drag.
- **FR-3.7 \[P1\] Multi-select drag:** Shift/Ctrl-click or marquee select, then drag the group.
- **FR-3.8 \[P1\] External drops:** a link or text/uri-list dragged from the address bar, another page, or the Open-Tab Drawer creates a card at the drop position.

### 7.4 Card features & quick actions

- **FR-4.1 \[P0\] Rich card:** local favicon (letter-tile fallback), title truncated with the full title on hover, clean hostname, note preview, tag pills, pin marker, and hover actions (open, edit, copy URL, delete). Density is compact or comfortable.
- **FR-4.2 \[P0\] Inline editing:** the edit button (✎) opens a lightweight modal for title, URL, note, tags, color label, and moving the card to another column or workspace. Ctrl/Cmd+Enter saves.
- **FR-4.3 \[P0\] Manual link addition:** “+ Add Link” in every column. Pasting several URLs (one per line) creates several cards. The title comes from a matching open tab if one exists, otherwise from the hostname, and stays editable. Optional title fetch is P2 because it needs a host permission.
- **FR-4.4 \[P0\] Instant delete with Undo:** × removes the card at once and shows a 4-second toast (“Bookmark deleted · Undo”). Deleted cards then move to Trash (P1): 30-day retention, restore, and empty. The toast is pulled forward into Step 2 so deleting is never destructive.
- **FR-4.5 \[P0\] Note cards:** type note, with a title and a Markdown-lite body (bold, italics, lists, links), created through “+ Add Note”, “Save selection as note”, or the palette. This matches Markmez’s ability to save notes alongside links.
- **FR-4.6 \[P1\] Tags:** colored pills, autocomplete, filter chips above the board, and rename or merge in settings.
- **FR-4.7 \[P1\] Pin to top:** pinned cards stay at the top of their column and feed the Speed Dial widget.
- **FR-4.8 \[P1\] Bulk actions:** with multi-select, a floating bar offers move, tag, open all, copy URLs (plain or Markdown), and delete.
- **FR-4.9 \[P1\] Open behavior:** click follows openLinksInNewTab; middle-click or Ctrl-click opens a background tab; Shift-click opens a new window. Each open updates lastOpenedAt and openCount (local only), which powers Recently opened and most-used sorting.

### 7.5 Command palette & instant search

- **FR-5.1 \[P0\] Focus:** / or Ctrl/Cmd+K focuses the search bar from anywhere on the New Tab page.
- **FR-5.2 \[P0\] Real-time filtering:** fuzzy-match title, hostname, URL, note, and tags with a simple scorer (exact substring beats word prefix beats subsequence, boosted by recency and openCount) and highlighted matches. Scope toggles between the current workspace and all workspaces.
- **FR-5.3 \[P0\] Keyboard navigation:** arrows move through results, Enter opens the top match (a Raycast/Spotlight-style launcher for saved links), and Ctrl/Cmd+Enter opens all matches (confirm above 20).
- **FR-5.4 \[P1\] Query operators:** tag:, host: (alias site:), in: (column), ws:, is:pinned, is:note, is:dupe, is:stale, older:30d, newer:7d, before: and after: with YYYY-MM-DD, “quoted phrases”, and -negation.
- **FR-5.5 \[P1\] Command mode (prefix >):** switch workspace, jump to column, new column, new note, review inbox, undo last save, export, import, toggle theme, open settings, and save window.
- **FR-5.6 \[P1\] Open-tab search (prefix @):** search live tabs across all windows; Enter focuses the chosen tab.
- **FR-5.7 \[P1\] Web fallback:** when no card matches, Enter searches the web through the browser’s default engine (search permission, requested on first use).
- **FR-5.8 \[P1\] Saved Views:** pin any query as a smart collection in the sidebar, for example tag:work older:30d.
- **FR-5.9 \[P0, Step 5\] Open-Tab Drawer:** a collapsible right-hand sidebar listing live tabs grouped by window, updated in real time from tab events. Drag a tab onto the board to save it, or use the per-tab Save and Save & Close buttons.

### 7.6 Data portability, backup & sync

- **FR-6.1 \[P0\] Full JSON export:** one-click download of minimal-board-backup-YYYY-MM-DD.json, containing schemaVersion and a checksum.
- **FR-6.2 \[P0\] JSON import and restore:** validate, then show a preview (for example, 3 workspaces, 640 cards, 38 duplicates skipped) and let the user choose Merge or Overwrite. A snapshot is taken automatically before Overwrite.
- **FR-6.3 \[P0\] Bookmark import:** import Chrome/Brave bookmarks through chrome.bookmarks (optional permission), mapping folders to columns (nested folders become nested pages or tags, the user’s choice) and preserving dates. Also import Netscape HTML bookmark files, which covers Firefox, Safari, and Edge exports. Auto-sort rules apply during import.
- **FR-6.4 \[P1\] Migration importers:** OneTab (plain text), Toby (JSON), Raindrop (HTML or CSV), and Markmez (format to be confirmed against a real export).
- **FR-6.5 \[P1\] More export formats:** Netscape HTML, CSV, and Markdown (each column as a heading with a link list) for Obsidian or Notion.
- **FR-6.6 \[P1\] Auto-backup:** rolling snapshots (last 10) in IndexedDB before risky operations and once a day, with a restore list. Optional scheduled file export to Downloads/MinimalBoard (downloads permission plus alarms).
- **FR-6.7 \[P2\] Sync Folder (account-free sync):** the user picks a folder inside a cloud-synced directory through the File System Access API, and the extension reads and writes a single sync file there. Merge is per entity (card, column, workspace): last writer wins by updatedAt, with tombstones for deletions, and is deterministic, idempotent, and unit-tested. Sync runs while a New Tab page is open; permission may need re-granting after a browser restart, so a manual Sync now action is always available.
- **FR-6.8 \[P2\] End-to-end encryption:** optional encryption of backups and the sync file with WebCrypto (AES-GCM, key derived from a passphrase with PBKDF2 at a high iteration count). The passphrase is never stored. Losing it makes the data unrecoverable, and the UI says so.
- **FR-6.9 \[P2\] Share as HTML:** export a workspace as one self-contained static HTML page.
- **FR-6.10 \[P1\] Storage meter:** show usage via getBytesInUse and warn when a library gets unusually large.

### 7.7 Personalization (Markmez parity and beyond)

- **FR-7.1 \[P1\] Themes:** dark (default), light, and auto (follows the system); accent color; all values as CSS variables; honors prefers-reduced-motion and high-contrast preferences.
- **FR-7.2 \[P1\] Wallpapers:** bundled gradients and solid colors plus user-uploaded images (downscaled to at most 2560 px, stored as blobs in IndexedDB). Dim and blur sliders keep cards legible, with an optional per-workspace wallpaper. No remote wallpaper downloads by default.
- **FR-7.3 \[P1\] Widgets:** all local, individually toggled, and mounted after first paint: clock and date (12/24 h), quick search (board or web), Speed Dial from pinned cards, scratchpad note, focus timer (Pomodoro), Recently saved and Recently opened strips, and Inbox stats (count and oldest age).
- **FR-7.4 \[P2\] Layout presets:** Board, List, and Gallery views; column width; and a custom-CSS box for power users.
- **FR-7.5 \[P2\] Localization:** chrome.i18n catalogs; English first, then German and Russian to match Markmez’s coverage.

### 7.8 Power organization (differentiators)

- **FR-8.1 \[P1\] Inbox Triage mode (press r):** a full-screen, one-card-at-a-time review, oldest first, with keys 1–9 (send to column N), o (open), p (pin), t (tag), d (delete), s (skip), u (undo), Esc (exit) and an N-left counter. It also works on any column or search result. Built to clear a 300-bookmark backlog in minutes.
- **FR-8.2 \[P1\] Stale detection:** cards untouched for staleAfterDays are flagged and queryable as is:stale, with an optional weekly review reminder badge.
- **FR-8.3 \[P1\] Auto-sort rules:** ordered rules (host, URL contains, title contains, tag) assign a target column and tags; first match wins; a dry-run preview shows the result before it is applied. Rules run on capture, on import, and through a Re-sort Inbox action. Fully local and deterministic, with no AI.
- **FR-8.4 \[P1\] Duplicate finder:** group cards by normalized URL across all workspaces and merge them, keeping notes and tags.
- **FR-8.5 \[P2\] Link health check:** user-initiated, rate-limited, behind an optional host permission; flags 404 and DNS failures. Never runs automatically.
- **FR-8.6 \[P2\] Read-later columns:** a column option that archives a card after it is opened, plus an Archive system column.

### 7.9 Sessions & tab management

- **FR-9.1 \[P1\] Restore sessions:** Open All offers here, new window, or tab group (name and color from the column; colors map to the nearest of Chrome’s fixed tab-group colors). Session columns offer Restore window.
- **FR-9.2 \[P1\] Tab groups as columns:** when saving a window, each tab group can become its own column, keeping its name and color.
- **FR-9.3 \[P1\] Tidy tabs:** find open tabs with the same normalized URL and close the extras; a Save & close all other tabs palette command.
- **FR-9.4 \[P2\] Crash recovery:** opt-in snapshots of open windows every 10 minutes via alarms (last 20 kept, incognito excluded), with a Recently closed windows list.

## 8. UI / UX Design Specifications

### 8.1 Dark theme (default; retained from v1.0)

- App background: #0f0f11 (Deep Obsidian)
- Column surface: #18181b (Zinc 900) with a 1 px #27272a border
- Card surface: #222226, with a #3f3f46 hover border
- Primary accent: #3b82f6 (Electric Blue); danger accent: #ef4444 (Crimson Red)
- Primary text: #f4f4f5; muted text: #a1a1aa
- Added: success ✓ #22c55e and warning/DUP #f59e0b
- Typography: system UI stack (-apple-system, BlinkMacSystemFont, Segoe UI, Inter, Roboto, sans-serif), with no web fonts and therefore no font-loading flicker

### 8.2 Light theme tokens (new)

- App background #f4f4f5; column surface #ffffff with a #e4e4e7 border; card surface #fafafa with a #d4d4d8 hover border
- Primary text #18181b; muted text #52525b; accent #2563eb; danger #dc2626
- All text and background pairs meet WCAG AA (4.5:1), and the accent picker checks contrast before applying a color.
- Motion stays at or under 150 ms and is disabled under prefers-reduced-motion.

### 8.3 Layout

- **Top bar:** workspace pills, search/palette trigger, + Column, Review, tab-drawer toggle, and a menu (import, export, settings).
- **Optional panels:** a left sidebar (nested pages, saved views) and a right drawer (open tabs). Both start collapsed so the board stays calm.
- **Widgets:** opt-in and kept in a quiet strip above the board; first run offers the clock and quick search.

### 8.4 Keyboard map

- **Global (New Tab page):** / or Ctrl/Cmd+K search · > commands · @ open tabs · n new link in the focused column · Shift+N new column · \[ and \] switch workspace · r review inbox · t toggle tab drawer · ? shortcut help · Esc close or clear.
- **Card focus:** arrows move focus · Enter open (Ctrl+Enter background tab, Shift+Enter new window) · Space select · e edit · x or Delete remove · p pin · c copy URL · m move to · Alt+Arrows reorder.
- **Browser-level (remappable):** Alt+Shift+S quick-save · Alt+Shift+A save window · Alt+Shift+B open board.

### 8.5 First run & empty states

- A three-step welcome: learn the Alt+Shift+S shortcut, import bookmarks or a backup, and pick a theme.
- Empty columns show a hint with the shortcut instead of blank space. The default workspace ships with Inbox, Dev, and Read columns.

### 8.6 Accessibility

- Full keyboard operation, visible focus rings, and ARIA roles for the board, columns, and cards, with live-region announcements for moves (for example, Moved to Read, position 3).
- Toasts use role=status, and Undo is reachable from the keyboard.
- Respect prefers-reduced-motion, prefers-color-scheme, and 200% zoom.

## 9. Implementation Roadmap

Each step ends with a working, testable extension loaded unpacked in Brave and Chrome. Releases: **v1.0 Daily driver** = Steps 1–6; **v1.5 Parity+** = Steps 7–8; **v2.0 Everywhere** = Steps 9–10.

### Step 1: Manifest V3 scaffold & New Tab override (Completed)

- manifest.json, newtab.html, and a storage read test.

### Step 2: Service worker, reactive board & store v2 (Current)

- **Scope:** lib/store.js (shards, Web Lock transactions, v1→v2 migration), lib/url.js, Alt+Shift+S capture with validation, duplicate prevention, ✓ / DUP / ✗ badges, default Inbox, Dev, and Read columns, onChanged live updates, card delete with the 4-second Undo toast, and the Save & Close setting with last-tab protection.
- **Acceptance:** a card appears at the top of Inbox within 100 ms of the shortcut; saving from one tab updates an open New Tab page without a reload; a duplicate URL (even with utm parameters) shows DUP and creates no card; chrome:// pages show ✗; 50 rapid saves produce exactly 50 cards with no lost writes; unit tests for url.js and store migrations pass.

### Step 3: Native drag-and-drop engine

- **Scope:** FR-3.1 to FR-3.6 (P0), then FR-3.7 and FR-3.8.
- **Acceptance:** order persists after reload; the ghost line is accurate; edge auto-scroll works; Esc cancels; Alt+Arrow moves cards; dragging in a 500-card column holds 60 fps.

### Step 4: Column CRUD, card editing & notes

- **Scope:** FR-2.2, FR-2.3, FR-2.4, FR-4.1 to FR-4.3, FR-4.5, FR-4.6.
- **Acceptance:** create, rename, and delete columns (with the move-to-Inbox option); add and edit link and note cards; multi-URL paste works; workspaces and nested pages persist.

### Step 5: Search, command palette & Open-Tab Drawer

- **Scope:** FR-5.1 to FR-5.9.
- **Acceptance:** results paint within 16 ms at 10,000 synthetic cards; query operators parse correctly (unit-tested); a live tab can be dragged from the drawer onto a column.

### Step 6: Sessions, backup/restore, import & Trash (release v1.0)

- **Scope:** FR-1.5, FR-1.9, FR-4.4 (Trash), FR-6.1 to FR-6.3, FR-6.6 (snapshots), FR-6.10, FR-9.1.
- **Acceptance:** one shortcut saves an entire window; export, wipe, and import reproduces the board exactly; 1,000 bookmarks import in 2 s or less; Overwrite creates a restorable snapshot.

### Step 7: Personalization

- **Scope:** FR-7.1 to FR-7.3 (themes, wallpapers, widgets), FR-2.5, and the List view from FR-2.7.
- **Acceptance:** widgets mount after first paint without breaking the load budget; an uploaded wallpaper persists; the light theme passes contrast checks.

### Step 8: Power tools (release v1.5)

- **Scope:** FR-1.6 to FR-1.8, FR-4.7 to FR-4.9, FR-5.8, FR-8.1 to FR-8.4, FR-9.2, FR-9.3.
- **Acceptance:** triage mode clears 100 cards with keys only; the auto-sort preview matches the applied result; the duplicate finder merges without losing notes.

### Step 9: Sync Folder & encryption

- **Scope:** FR-6.4, FR-6.5, FR-6.7, FR-6.8, FR-6.9.
- **Acceptance:** two browser profiles converge on the same board through a shared folder; merge is idempotent (unit-tested with random edit sequences); a wrong passphrase fails safely.

### Step 10: Polish & release (release v2.0)

- **Scope:** FR-1.10 with Gallery view, FR-8.5, FR-8.6, FR-9.4, FR-7.4, FR-7.5, onboarding, accessibility audit, and packaging.
- **Acceptance:** keyboard-only and screen-reader passes succeed; every budget in Section 5.6 is verified on a 10,000-card library.

## 10. Testing & QA

- Unit tests for pure modules (url, search, merge, store reducers and migrations) with node --test and no installs.
- A manual smoke checklist per step in Brave and Chrome, then Edge.
- Fault injection: stop the service worker mid-save, fire 50 captures rapidly, edit in two New Tab pages at once, import malformed or hostile JSON (titles containing HTML, javascript: URLs), and load a 10,000-card synthetic library.
- Accessibility: keyboard-only run, screen-reader spot check, contrast check, and 200% zoom.
- Release gate: a restore-from-backup rehearsal and a clean-profile install test.

## 11. Risks & Open Questions

### Risks and mitigations

- **Service worker shutdown mid-operation:** idempotent transactions under a shared lock, with no reliance on in-memory state.
- **Favicon API misses never-visited pages:** letter tile plus the tab-provided icon captured at save time.
- **File System Access permission prompts after restart:** Sync Folder is best-effort, with a manual Sync now action.
- **Chromium forks differ in new-tab override and shortcut behavior (Arc, Opera, Yandex):** test Brave, Chrome, and Edge first; treat others as best-effort.
- **User error or corruption:** trash, undo, rolling snapshots, and versioned exports.
- **Web store review, if ever published:** single-purpose and permission-justification rules, so sideloading stays the default distribution.

### Open questions

1. What does Markmez’s export format look like (needed for a one-click switch importer)?
2. Should tab groups become columns by default when saving a window?
3. Are three levels of nested pages enough?
4. Should the extension ever be published to a store, or stay personal and sideloaded?

## 12. Changes from v1.0 (summary)

- **Storage redesigned** from a single appState blob into small shards with Web Lock transactions, so it stays fast at thousands of cards and never loses writes between the service worker and the New Tab page.
- **Privacy aligned with the vision:** favicons default to the local browser API, and Google S2 is opt-in.
- **Safer defaults:** Undo and Trash arrive earlier (Step 2), and the toolbar-icon click saves one tab instead of the whole window.
- **Added to reach and beat Markmez:** note cards, nested pages, command palette with search operators, tab switcher, triage mode, auto-sort rules, saved views, importers, auto-backup, Sync Folder with optional encryption, wallpapers, widgets, a keyboard alternative to dragging, security and accessibility requirements, performance budgets, and a testing plan.
- **Roadmap extended** from 6 to 10 steps, each with acceptance criteria, grouped into three releases.
