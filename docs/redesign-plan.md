# DriveClean UI redesign plan

Status: proposed, 2026-11-19. Nothing is built yet.

## 1. Goals

1. Make DriveClean look and behave like the current AWS console: dense, calm, built from tables, a dark top bar, a grouped side menu, breadcrumbs, a help panel and notifications at the top of the page.
2. Replace Material UI with **Cloudscape Design System**, the open-source system the AWS console itself is built with.
3. Use **Geist** as the typeface, self-hosted.
4. Open in the **light theme** by default, with dark mode as an option in Settings.
5. Add a real favicon and tab title.
6. Make the main job, **getting storage back safely**, the centre of every page. Today the reclaimable numbers are spread across three pages and the Keep/Trash decision is visually weak.
7. **Loading that feels fast and never shows wrong values**: placeholders shaped like the content, instant feedback on every action, and live progress for long jobs (section 7).
8. **Interactive charts** that answer "where is my space going?" and lead straight to the files involved (section 8).
9. Overall: an experience that is fast, predictable and forgiving, measured by the targets in section 9.

Not changing: the backend, the API, the TanStack Query hooks in `src/hooks`, the services in `src/services`, the types, and the safety rules (nothing is deleted permanently; every trash action is approved by the user). This is a presentation-layer rewrite only.

## 2. Problems with the current UI

Found by reading the code and taking screenshots on 2026-11-19.

| # | Problem | Where |
|---|---|---|
| 1 | Default MUI theme with no identity. Tab title is "frontend"; the favicon is the Vite logo. | `main.tsx:12`, `index.html` |
| 2 | While it loads, the dashboard says "Start first scan" and "Never" for several seconds, even though 160 scans exist. | `Dashboard.tsx`, `ScanPanel.tsx` |
| 3 | The dashboard is 8 equal stat cards. "Space you can free" (199 MB duplicates + 6.7 GB similar photos) isn't on it. | `Dashboard.tsx` |
| 4 | The main actions sit inside info banners with paragraphs of explanation; on Duplicates, three buttons wrap onto three lines each. | `Duplicates.tsx:107`, `SimilarPhotos.tsx:128`, `Trash.tsx:76` |
| 5 | Keep and Trash look nearly the same; the keeper photo is marked only by a small outlined chip. | `Duplicates.tsx`, `SimilarPhotos.tsx` |
| 6 | Wrapped rows of thumbnails are shifted about 16px right (a spacing side effect when the row wraps). | `SimilarPhotos.tsx:73` |
| 7 | A flat menu of 10 items that doesn't follow the order of the work (scan → find → review → trash). | `MainLayout.tsx` |
| 8 | The side menu is a fixed 220px and never collapses on small screens. | `MainLayout.tsx:57` |
| 9 | Empty and loading states don't say what to do next (Cleanup only mentions Duplicates; list pages show nothing while loading). | `Cleanup.tsx:111`, `Duplicates.tsx` |
| 10 | Wording uses internal terms ("Re-group", raw `operation_type`, "Go to Cleanup"). | several |

## 3. Library decision: Cloudscape

| Option | Verdict |
|---|---|
| **Cloudscape** (`@cloudscape-design/components` 3.0.x, React >= 16.8) | **Chosen.** It is the AWS console's own system, so the look comes with it rather than being imitated: AppLayout, TopNavigation, SideNavigation, a Table with sorting, filtering, selection, expandable rows and column preferences, HelpPanel, Flashbar, Modal, KeyValuePairs, StatusIndicator, ProgressBar and charts. It has light/dark mode, comfortable/compact density and theming tokens. Maintained weekly (3.0.1419 published 2026-11-17). |
| Keep MUI and restyle it | Rejected. The console look would need hundreds of overrides and would drift. |
| shadcn/ui + Tailwind | Rejected for this brief. Modern, but there is no console-grade data table, app layout or help panel; we would rebuild what Cloudscape already gives us. |
| Fluent UI / Carbon | Good systems, but they look like Microsoft and IBM, not AWS. |

Packages to add:

```
@cloudscape-design/components        UI components (imported per component, e.g. /button)
@cloudscape-design/global-styles     base CSS, applyMode, applyDensity
@cloudscape-design/collection-hooks  client-side filter/sort/paginate for small tables
@cloudscape-design/design-tokens     tokens for the few custom pieces (photo grid, space bar)
@fontsource-variable/geist           self-hosted Geist (no external font request)
@fontsource-variable/geist-mono      only for MD5 hashes and file IDs
```

Packages to remove at the end: `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`. Cloudscape ships its own icon set; we'll add one custom icon (the logo).

Migration approach: Cloudscape and MUI can live side by side, so pages move over one at a time and every commit still builds and runs. MUI's `CssBaseline` is removed in phase 0 so it doesn't fight Cloudscape's base styles.

## 4. Visual foundation

### 4.1 Typeface

- **Geist Variable** for the whole UI. It's a modern grotesk drawn for screens, compact at small sizes (good for dense tables), and has tabular figures so sizes and counts line up in columns.
- **Geist Mono** only where the value really is code-like: MD5 checksums, Google file IDs. Not for labels.
- Set through Cloudscape theming: `applyTheme({ theme: { tokens: { fontFamilyBase: "'Geist Variable', …system-ui stack" } } })`, plus `font-variant-numeric: tabular-nums` on table cells and key-value values.
- Keep Cloudscape's own type scale (heading XL 24, L 20, M 18, S 16, body 14, small 12). The console look depends on it; changing it would break the resemblance.

### 4.2 Colour

Cloudscape's palette as-is, so it reads as a console. DriveClean adds one brand accent plus fixed meanings for the app's two decisions.

| Role | Token / value | Use |
|---|---|---|
| Page background | Cloudscape default (`colorBackgroundLayoutMain`) | light grey canvas |
| Containers | Cloudscape default (white in light mode) | all panels |
| Top bar | Cloudscape dark top navigation | app name, account menu |
| Brand accent | `#0F7B8A` teal ("Drive teal") | logo, favicon, the bar for space you can free. Never for buttons. |
| Primary actions | Cloudscape primary blue | buttons and links, as in the console |
| Keep | `colorTextStatusSuccess` / `colorBorderStatusSuccess` | Keep decision, keeper outline |
| Marked for Trash | `colorTextStatusWarning` | Trash decision, dimmed thumbnails |
| Errors | `colorTextStatusError` | failures only |

Rules:
- Green and amber mean only Keep and Trash. Nothing else uses them, so a decision is always recognisable.
- Teal is decoration for the brand and the space bar only; actions stay Cloudscape blue.
- Dark mode uses Cloudscape's dark tokens; the teal is lightened to `#3FB6C4` for contrast.

### 4.3 Density, mode and preferences

- Defaults: **light mode, comfortable density**.
- Settings gets a "Display" section: Theme (Light / Dark / Match system) and Density (Comfortable / Compact). Applied with `applyMode` / `applyDensity` and remembered in `localStorage`, read safely (if it fails, use the defaults).

### 4.4 Favicon and title

- Tab title: `DriveClean`; page titles become `Duplicates · DriveClean`, set per route.
- Logo mark: a rounded square in Drive teal holding a white stack of two file sheets, the front one with a small check mark cut-out ("copies, sorted"). Drawn as an SVG on a 32px grid that still reads at 16px.
- Files:
  - `public/favicon.svg`: the mark, with a dark-mode variant via `prefers-color-scheme` inside the SVG.
  - `public/favicon.ico` (16/32) and `public/apple-touch-icon.png` (180) for browsers and pinned tabs.
  - `<meta name="theme-color">` for light and dark.
- The same mark appears in the top bar next to "DriveClean".

### 4.5 Writing

Cloudscape's writing rules match ours:
- Sentence case everywhere, including buttons and table headers.
- Buttons say exactly what they do, and the result uses the same verb: "Move to Trash" → "Moved 214 files to Trash".
- Explanations go in the help panel behind an "Info" link, not in banners above the content.
- Empty states name the next step and offer a button for it.
- Errors say what happened and what to do, with no apology.

## 5. App shell

```
┌ TopNavigation (dark) ─────────────────────────────────────────────────────────┐
│ [logo] DriveClean                          Open Google Drive ↗   [user ▾]     │
├───────────────┬───────────────────────────────────────────────────────────────┤
│ SideNavigation│ Breadcrumbs: DriveClean > Duplicates                           │
│               │ Flashbar (scan running, cleanup progress, results)             │
│ Dashboard     │ ┌ ContentLayout header ───────────────────────────── Info ┐   │
│               │ │ Duplicates (263)                  [Find duplicates]    │   │
│ Storage       │ │ Exact copies of the same file.  [Review in Cleanup]    │   │
│   Files       │ └────────────────────────────────────────────────────────┘   │
│   Analytics   │ page content (Containers, Tables)                  ┌ Help ┐   │
│ Find and review│                                                   │panel │   │
│   Duplicates 263                                                   │      │   │
│   Similar photos 830                                               └──────┘   │
│   Organizer   │                                                               │
│ Clean up      │                                                               │
│   Cleanup  214│                                                               │
│   Trash       │                                                               │
│ ─────────     │                                                               │
│ Scan history  │                                                               │
│ Settings      │                                                               │
└───────────────┴───────────────────────────────────────────────────────────────┘
```

- `AppLayout` (or `AppLayoutToolbar`, whichever the installed version recommends) with `navigation`, `breadcrumbs`, `notifications`, `tools` (help panel) and `content`. It collapses the side menu to a drawer on narrow screens, which fixes problem 8.
- `TopNavigation`: logo + "DriveClean"; utilities: "Open Google Drive" (external), and a user menu with the account email, "Settings" and "Disconnect Google Drive".
- `SideNavigation` grouped by the order of the work. Badges show live counts: groups to review, files marked for Trash.
- **Notifications** (`Flashbar`), handled in one shared `NotificationsProvider`:
  - a scan, photo analysis or cleanup in progress appears as an ongoing notification with a progress bar, on every page;
  - results ("Moved 214 files to Trash. Restore") and errors appear as dismissible notifications.
  This replaces the scattered banners.
- **Help panel**: each page has a `HelpPanel` with the explanations that are now in banners (how exact matching works, what the 64-pixel preview is, Drive's 30-day Trash rule). Headers get an "Info" link that opens it.
- Routing: React Router stays. SideNavigation and Breadcrumbs `onFollow` calls `navigate()` so links stay client-side.

## 6. Pages

Each page uses `ContentLayout` + `Header` (title, counter, description, actions, Info link). Lists use `Table` with `Pagination` and, where useful, `TextFilter` / `PropertyFilter` and `CollectionPreferences` (page size, visible columns, wrap lines). Lists paginated on the server keep server paging; small lists use `useCollection`.

### 6.1 Connect (signed out)

- A centred narrow `Container` on the page background: logo, "Connect your Google Drive", three short reassurance lines (reads metadata only; never downloads files; nothing moves without your approval), and the primary button "Connect Google Drive".
- Sign-in errors appear as an `Alert` above the button, with the existing wording.

### 6.2 Dashboard

Layout: a "service dashboard". Header actions: `Sync now`, and `New scan` as the primary button.

```
┌ Space you can free ──────────────────────────────────────── Info ┐
│ 6.9 GB   of 103 GB in your Drive                                  │
│ ███████████▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                    │
│ Similar photos 6.7 GB · Duplicates 199 MB · In Trash 0 B          │
│ [Review similar photos]  [Review duplicates]                      │
└───────────────────────────────────────────────────────────────────┘
┌ Drive scan ─────────────────┐ ┌ Quick sync ──────────────────────┐
│ ● Completed  19 Nov, 11:30  │ │ Last synced 12:19                │
│ 29,210 files · 1 m 40 s     │ │ [toggle] Every 15 minutes  ▾     │
└─────────────────────────────┘ └──────────────────────────────────┘
┌ Next steps ──────────────────────────────────────────────────────┐
│ 1 Scan Drive ✓   2 Review matches (263 + 830 groups)              │
│ 3 Move marked files to Trash (0)   4 Drive deletes after 30 days  │
└───────────────────────────────────────────────────────────────────┘
┌ Inventory ───────────────────────────────────────────────────────┐
│ Items 25,225 · Files 23,906 · Folders 1,252 · Google Docs 67     │
│ Shared with you 724 · In Trash 0                                  │
└───────────────────────────────────────────────────────────────────┘
```

- **Space you can free** is the one bold element in the app. A large figure, then a custom segmented bar (Drive teal for similar photos, a lighter teal for duplicates, grey for Trash) drawn with design tokens, then links to review each.
- **Drive scan**: `StatusIndicator` (success / in progress / error / stopped), `ProgressBar` while running, and Resume/Cancel as actions in the container header.
- **Quick sync**: the existing controls as a Cloudscape `Toggle` and `Select`.
- **Next steps**: 1–4 numbering is used because it really is a sequence. Each step shows its live state and links to its page.
- **Inventory**: `KeyValuePairs` in 3 columns; secondary.
- **Loading**: every container shows its own loading state. The page never shows "Start first scan" or "Never" until the scans query has actually returned (fixes problem 2).

### 6.3 Files

- `Table` with server-side pagination (as today) and `PropertyFilter` for name, type, owner (me / shared), year and "In Trash". Filters stay in the URL query as today.
- Columns: Name (link to Drive ↗), Type, Size (right-aligned, tabular figures), Modified, Owner, Status (a badge for "In Trash" or "Shared").
- `CollectionPreferences`: page size (25/50/100), visible columns, wrap lines.
- Row selection is left out: this page is for browsing. Actions happen on review pages.

### 6.4 Storage analytics

- Top: `KeyValuePairs` (storage used by files, in Trash, reclaimable duplicates, reclaimable similar photos).
- **By type** and **By year created**: Cloudscape `BarChart` (horizontal for type, vertical for year), with values in readable units. Charts follow the `dataviz` guidance: one series colour, direct value labels, no legend for a single series.
- **Largest folders** and **Largest files**: `Table`s with a small inline bar in the Size column (custom cell using the same token colour).

### 6.5 Duplicates (exact)

Header: "Duplicates (263)". Description: "Exact copies of the same file. 4,462 files, up to 199 MB you can free." Actions: `Find duplicates`, and `Review in Cleanup (n)` as the primary button when anything is marked.

- One `Table` with **expandable rows**: each group is a parent row and its copies are child rows.
  - Group row: "VH-GEN-001A_Folder.rar", "2 copies", "7.4 MB each", "Save 7.4 MB".
  - Child rows: Name (link ↗), Folder path, Created, Modified, Decision.
- **Decision cell**: a `SegmentedControl` (Keep | Trash) with a status-coloured label next to it: "Keep (suggested)" in green, "Trash" in amber. A user's choice and an applied suggestion look different (a "suggested" suffix vs. none).
- Group selection + header `ButtonDropdown` "Apply suggestions" → "To selected groups", "To this page", "To all 263 groups". "To all" opens a small confirm `Modal` that states the count and that nothing changes in Drive yet.
- Sorting by savings / copies / size uses the table's own sortable columns, not a separate dropdown.
- The MD5 explanation moves to the help panel.
- Empty state: "No duplicates found" + `Find duplicates`. Before any scan: "Scan your Drive first" + `Go to dashboard`.

### 6.6 Similar photos

Header: "Similar photos (830)", description with the photo count and space you can free, actions `Check for new photos` (primary) and a `ButtonDropdown` with "Group again with current settings" (the old "Re-group").

- **Analysis** `Container`: `KeyValuePairs` (analysed 12,347 of 12,347; could not be read 38; skipped under 30 KB) and a `ProgressBar` while running, with Stop/Resume in the container header. The long explanation moves to the help panel.
- **Groups**: one `Container` per group, header "10 similar photos · Save up to 241 MB", with actions `Keep only the suggested copy` and `Keep all`.
- **Photo tiles**: a custom responsive CSS grid (`repeat(auto-fill, minmax(180px, 1fr))`, `gap`, which fixes problem 6):
  - **Keeper**: a 2px success-green border, a "Keep" badge on the image, and full opacity.
  - **Marked for Trash**: the image dimmed to 55% with an amber "Trash" badge. Hover or focus restores full opacity so it can still be inspected.
  - Clicking the tile, or pressing Space when it is focused, toggles Keep/Trash; an explicit `SegmentedControl` stays under each tile for clarity. The "open in Drive" link is a separate icon button so it doesn't toggle the tile.
  - Caption: name, size, modified date. The "Suggested: best copy" chip is gone; the keeper outline already says it.
- Group pagination as now (10 per page) with Cloudscape `Pagination` at the top right of the groups list.

### 6.7 Organizer

- Header actions: `Select high-confidence suggestions`, and `Move selected (n)` as the primary button.
- `Table` with multi-selection. Columns: File, Current folder, Move to, Confidence (`Badge`: high = green, medium = grey, with the percentage), Reason.
- Moving is reversible, but it is still a Drive change, so a confirm `Modal` lists the count and the destination folders.
- **Move history** as a second `Table` on the same page, with `StatusIndicator` and an `Undo` row action.
- The missing permission ("Allow moving files") appears as a warning `Alert` at the top with the upgrade button, as now.

### 6.8 Cleanup (move to Trash)

Header: "Cleanup", with the description "Files you marked for Trash. They go to Google Drive's Trash and can be restored for 30 days." Action: `Move 214 files to Trash` as the primary button.

- **Ready to move** `Table` with `TextFilter` and pagination over every marked file (not just the first 100 as now). Columns: File to trash, Copy you keep, Source (Duplicates / Similar photos), Size. Row action "Keep instead" unmarks the file.
- Blocked groups appear as a warning `Alert` listing each group in an `ExpandableSection`.
- **Confirm** `Modal`: "Move 214 files (1.2 GB) to Trash?", a key-value summary (files, size, groups, estimated time), a note that every file is checked against Drive first, and the buttons `Cancel` and `Move to Trash`.
- **Progress** appears in the Flashbar (visible on every page) with a progress bar and "Cancel remaining". When it finishes: "Moved 214 files to Trash. View history".
- **History** `Table`: When, Action (in words: "Moved to Trash" / "Restored"), File, Size, Status (`StatusIndicator`), and a row action `Restore`. Selecting several rows allows `Restore selected`.
- Empty state: "Nothing marked for Trash" with `Review duplicates` and `Review similar photos`.
- No permission: a warning `Alert` with `Allow moving to Trash`.

### 6.9 Trash

- `KeyValuePairs`: Taking up space, Deleted by Drive within 7 days, Next automatic deletion.
- One info `Alert` in a single line: "Drive deletes items 30 days after they're trashed. Empty the Trash in Drive to free space sooner." with the action `Open Drive Trash ↗`. The rest of the explanation goes to the help panel.
- `Table` with sortable Name, Trashed, Deleted by Drive (date plus "in 5 days" in warning colour within 7 days), Size, and a "Trashed in DriveClean" badge.
- Missing dates: a warning `Alert` with `Fetch dates`; the result appears as a notification.
- Empty state: "Your Trash is empty."

### 6.10 Scan history

- `Table`: Status (`StatusIndicator`), Files, Started, Duration, Error (wrapped text). `useCollection` for client-side paging.

### 6.11 Settings

- **Google Drive connection**: `KeyValuePairs` (account, permissions granted: read metadata / move to Trash / move files) with `Allow more access` and `Disconnect` actions. Disconnect opens a confirm `Modal`, replacing the inline confirm.
- **Display**: Theme (Light, the default / Dark / Match system) and Density (Comfortable, the default / Compact) as `Tiles` or `RadioGroup`.
- **Sync**: the auto-sync toggle and interval, moved here from the dashboard (the dashboard keeps a status summary and "Sync now").

## 7. Loading and feedback

The rule: **the screen is never blank, never wrong, and never silent.** A placeholder shows where content will appear, a value is only shown once it's real, and every click gets a visible response straight away.

### 7.1 Timing thresholds

| How long it takes | What the user sees |
|---|---|
| Under 300 ms | Nothing extra; the content just appears, so there's no flicker. |
| 300 ms – 10 s | A placeholder shaped like the content, or a loading state on the button that was clicked. |
| Over 10 s (scan, photo analysis, cleanup, fetching dates) | Exact progress: "8,412 of 12,347 photos", a progress bar, an estimated time left and speed, plus Stop/Cancel. Shown in the notification bar on every page. |
| Running in the background after leaving the page | The notification keeps running; when it finishes, a result notification with a link to the result. |

A shared `useDelayedFlag(isLoading, 300)` hook gives this timing to every component.

### 7.2 Placeholders shaped like the content

Cloudscape has no skeleton component, so a small `Skeleton` set is built with its design tokens (`colorBackgroundContainerHeader`-tinted blocks with a gentle shimmer that switches off for reduced motion):

- **Dashboard**: the "Space you can free" figure and bar, the scan and sync status, and the inventory values each get a placeholder the same size as the real content, so nothing jumps when data arrives.
- **Tables**: Cloudscape `Table` `loading` + `loadingText` on first load ("Loading duplicate groups"). On refetch, page change or sort, the **previous rows stay visible** (TanStack `placeholderData: keepPreviousData`), with a thin progress line under the header instead of emptying the table.
- **Photo tiles**: a fixed 4:3 tile with a placeholder block, so the grid never reflows. The image fades in when loaded. A broken image becomes a "Preview unavailable" tile with the file icon and a "Open in Drive" link.
- **Charts**: Cloudscape chart `statusType="loading"` with a chart-shaped placeholder; `statusType="error"` with "Retry".
- **Pages**: routes are split with `React.lazy`; the Suspense fallback is the page header + content placeholders, so the shell (menu, top bar) never disappears.

### 7.3 Instant feedback on actions

- **Optimistic updates** for Keep/Trash decisions and "Apply suggestions": the UI changes the moment you click, the request runs in the background, and if it fails the change is rolled back with an error notification that has a "Retry" button.
- Every button that starts a request uses Cloudscape's `loading` state, and repeated clicks are blocked while it runs.
- Bulk actions show a result notification with **Undo** for 10 seconds ("Marked 1,204 files for Trash in 263 groups. Undo"). Undo restores the previous decisions.
- Counts in the side menu (marked for Trash, groups to review) update as soon as decisions change.

### 7.4 Prefetching

- Hovering or focusing a menu item prefetches that page's first query.
- On the review pages the next page of groups and its thumbnails are prefetched, so "Next" is instant.
- Hovering a duplicate group's row prefetches its details.

### 7.5 Errors and offline

- A failed request in a container shows an inline error state in that container ("Couldn't load scan status. Retry"), not a page-wide failure.
- If the backend can't be reached, a single persistent notification says so and retries automatically with backoff; it disappears when the connection comes back.
- Google permission problems always name the permission and offer the button to grant it.

## 8. Interactive visualizations

Every chart answers one question, shows the details on hover or keyboard focus, and **links straight to the files involved**. Built with Cloudscape charts (interactive popovers, legend filtering, keyboard navigation and screen-reader text are built in) plus one custom treemap. All charts follow the `dataviz` skill: one hue per meaning, readable units, direct labels, light and dark mode checked.

| Where | Visual | Question it answers | Interaction |
|---|---|---|---|
| Dashboard | **Space you can free bar** (custom, segmented) | How much can I get back, and from where? | Hover/focus a segment for a breakdown popover; click to open Similar photos, Duplicates or Trash. The bar fills once on first load (the only automatic animation in the app; off for reduced motion). |
| Dashboard | Storage by type, small donut (`PieChart` donut) | What kind of files fill my Drive? | Hover for size and share; popover footer link "View files" opens Files filtered by that type. |
| Analytics | **Folder treemap** (custom SVG, layout by `d3-hierarchy`) | Which folders are biggest, all the way down? | Click a folder to zoom into it; breadcrumbs to go back up; hover for size, file count, and reclaimable duplicates in it; "Show files" opens Files filtered by folder. Arrow keys move between tiles, Enter zooms in. Rectangles are labelled when there's space; a table view toggle shows the same data as a sortable table. |
| Analytics | Storage by type (`BarChart`, horizontal) | Same as the donut, in full | Legend filter; popover link "View files". |
| Analytics | Storage by year created (`BarChart`, stacked by type) | When did my Drive grow? | Hover a year for the per-type breakdown; click "View files" for that year; legend toggles types. |
| Analytics | Largest files (table with an inline size bar) | What single files are worth looking at? | Sortable; row links open in Drive. |
| Similar photos | **Compare view** (`Modal`, side-by-side) | Are these photos really the same? | Open from a group; up to 4 photos side by side at large size with zoom on click; size, dimensions (when Drive provides them) and dates with differences highlighted; Keep/Trash decisions can be made in the dialog; arrow keys move to the next group. |
| Trash | Deletion timeline (`BarChart`, bytes by day for the next 30 days) | When will Drive free this space by itself? | Hover a day for files and size; click to filter the table to that day. |
| Scan history | Scan trend (`LineChart`: files scanned and duration per scan) | Is my Drive growing, are scans getting slower? | Hover for exact values; toggle series. |
| Cleanup (running) | Live progress (`ProgressBar` with files/min and time left) | When will it finish? | Cancel remaining from the same notification. |

New dependency: `d3-hierarchy` (layout maths only, around 10 KB; rendering stays in React). Treemap data comes from the existing largest-folders endpoint; if it needs nested folder totals, that is a small backend addition flagged in phase 4.

## 9. UX targets

How we'll know the experience is better. Each one is checked in the phase that touches it.

| Target | Measure |
|---|---|
| Never show a wrong value | No placeholder value ("Never", "0", "Start first scan") before its query has returned. Checked by throttling the network to "Slow 4G" in Chrome. |
| Feedback for every action | Visible response within 100 ms of any click (optimistic change, button loading state or notification). |
| No layout jumps | Content doesn't shift when data or images load (placeholders match final sizes). |
| Fast navigation | With data cached, switching pages shows content immediately; first visit shows the page frame immediately and data as it arrives. |
| Clear path to clean up | From the dashboard, each step names and links the next: Review duplicates → Apply suggestions → result notification "Review 1,204 files in Cleanup" → Move to Trash. No more clicks than today, but you always see what is selected before anything changes in Drive. |
| Faster photo review | Keyboard review: `J`/`K` next/previous group, `1` keep / `2` trash on the focused photo, `A` apply the suggestion to the group, `C` open the compare view. Shortcuts listed in the help panel and under `?`. |
| Forgiving | Every bulk decision can be undone from its notification; every Trash move can be restored from history. |
| State survives reloads | Filters, sorting, page number and the open folder in the treemap live in the URL. |
| Accessible | Keyboard-only completion of a full review and cleanup; no contrast failures in either theme. |

## 10. Code structure

```
frontend/src/
  main.tsx                    global-styles import, fonts, theme, mode/density init
  theme/
    theme.ts                  applyTheme tokens (font, brand teal)
    preferences.ts            mode and density, safe localStorage
  layouts/
    AppShell.tsx              AppLayout + TopNavigation + SideNavigation + breadcrumbs
    navigation.ts             nav sections, routes, badges, breadcrumb labels
    NotificationsProvider.tsx Flashbar state (useNotify hook)
    HelpPanelProvider.tsx     per-page help content (useHelp hook)
  components/
    common/                   StatusFor (scan/op status → StatusIndicator), Bytes, EmptyState, InfoLink
    loading/                  Skeleton blocks, PageSkeleton, ImageWithPlaceholder, useDelayedFlag
    charts/                   SpaceBar, StorageTreemap, TypeDonut, YearBars, TrashTimeline, ScanTrend
    dashboard/                SpaceToReclaim, ScanContainer, SyncSummary, NextSteps, Inventory
    review/                   DecisionControl (Keep|Trash), PhotoTile, PhotoGroup, DuplicateTable, CompareModal, useReviewShortcuts
  pages/                      same 11 pages, rewritten on Cloudscape
  hooks/ services/ types/ utils/   unchanged
```

`DecisionControl` is shared by Duplicates and Similar photos so the Keep/Trash look and behaviour are the same everywhere.

## 11. Accessibility and quality floor

- Cloudscape components handle focus, keyboard support and ARIA. Custom pieces (photo tiles, space bar) get: visible focus rings using Cloudscape's focus token, `role="button"` + `aria-pressed` on tiles, and text alternatives for the bar ("6.9 GB of 103 GB can be freed").
- Colour is never the only signal: Keep and Trash always carry text badges.
- `prefers-reduced-motion` respected (Cloudscape does this; custom transitions are limited to the tile opacity change).
- Works down to 360px wide: the side menu becomes a drawer, tables scroll inside their container, the photo grid drops to 2 columns.
- Contrast checked in both modes for the teal accent and the status colours.

## 12. Phases

Each phase builds, runs, and is committed and pushed with a README progress-log entry.

| Phase | Scope | Done when |
|---|---|---|
| 0. Foundation | Install Cloudscape and fonts; global styles; theme tokens; mode/density preferences with light as the default; favicon and logo; tab titles; `AppShell` with grouped navigation, breadcrumbs, notifications and help panel. Remove `CssBaseline`. Loading toolkit (`Skeleton`, `useDelayedFlag`, `ImageWithPlaceholder`), route-level code splitting, `keepPreviousData` as the query default, the offline/backend-down notification. Old pages render inside the new shell. | App opens in light mode in the new shell; the side menu collapses at narrow widths; favicon appears; switching pages never blanks the shell. |
| 1. Dashboard, Connect, Settings | Space-you-can-free container, scan/sync containers, next steps, inventory, content-shaped placeholders; interactive space bar and storage-by-type donut; connect page; settings with display preferences. | The dashboard shows space you can free; no wrong "Never" while loading (checked on Slow 4G). |
| 2. Review pages | `DecisionControl`, Duplicates expandable table with batch "Apply suggestions", Similar photos tiles/groups and analysis container; optimistic decisions with rollback; Undo notifications for bulk actions; compare view; keyboard shortcuts; prefetch of the next page and thumbnails. | Keeper vs Trash readable at a glance; thumbnail grid aligned; actions in headers; a group can be reviewed with the keyboard alone. |
| 3. Cleanup and Trash | Ready-to-move table (all rows), confirm modal, live progress in the notification bar (speed and time left), history with restore; Trash page with the deletion timeline. | A full cleanup run can be done and undone from the new UI. |
| 4. Files, Analytics, Organizer, Scan history | Property filter table; Analytics with the folder treemap (drill-down, keyboard, table view), type and year charts linking to filtered Files; organizer selection table and history; scan history with the trend chart. | Every route is on Cloudscape; every chart links to the files behind it. |
| 5. Remove MUI and polish | Uninstall MUI/Emotion; dark mode and compact density checked; a11y pass; responsive pass; bundle size check; run through every UX target in section 9; README update. | `grep -r "@mui" src` is empty; build and lint pass; light and dark screenshots of every page reviewed. |

## 13. Verification per phase

- `npm run build` and `npm run lint`.
- Screenshots of every changed page in Chrome at 1440px and 390px, in light mode and dark mode, compared with the "before" screenshots from 2026-11-19.
- Exercise the live flows against the running backend: start a scan, mark files, apply suggestions, move one test file to Trash and restore it.
- Keyboard-only pass over the review pages (Tab, Space/Enter on tiles and segmented controls, review shortcuts).
- Loading checks with Chrome network throttling (Slow 4G): placeholders appear, no wrong values, no layout jumps; offline notification when the backend is stopped.

## 14. Risks and open questions

- **Bundle size**: Cloudscape is larger than the MUI subset in use. Mitigation: per-component imports and route-level code splitting with `React.lazy`. Check the size in phase 5.
- **Custom styling**: Cloudscape discourages overriding its components. Custom visuals are limited to the space bar and photo tiles, built with its design tokens so they follow light/dark mode.
- **Expandable rows with server pagination**: groups are already paginated by the server, so the page's groups expand locally. Large groups (50+ photos) show their first 24 files with "Show all".
- **Name**: the plan keeps "DriveClean", as used in the README and the app. If you want "Drive Sweeper" (the repo name), it's a one-line change in phase 0.
- **Treemap data**: if the existing folder endpoint only returns top-level folders, the treemap needs a small backend endpoint for nested folder totals (phase 4).
- **Photo dimensions** for the compare view depend on Drive's image metadata being stored; if it isn't, the compare view shows size and dates only until the scanner stores it.
- **React 19**: Cloudscape declares `react >= 16.8`. If any component warns under React 19, it'll be noted and worked around in the phase where it shows up.
