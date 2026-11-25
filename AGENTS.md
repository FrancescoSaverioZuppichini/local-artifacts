# AGENTS.md · local-artifacts

local-artifacts renders folders of media and text as pages: a contents sidebar, foldable sections, cards, a full-screen viewer
with a compare wipe, a synced side-by-side player, and 👍/👎, notes and text comments saved to `feedback.json`.
**Publishing a page means writing files.** No build step, no restart, no thumbnails to make.

## Layout

```
server.ts          Bun server: ?path= pages, MDX compile, media probes, thumbnails, Range video, feedback, /api/check
app.tsx            client entry: one page, or the list of pages
shell/             around the content: layout + polling (page.tsx), sidebar + links (toc.tsx), viewer.tsx and
                   the zoom stage for every card and column (zoom.tsx), side-by-side.tsx, the shared video clock (player.tsx), text comments
                   (comments.tsx, anchor.ts), the one note look (comment.tsx), dates (time.tsx), the zustand store and
                   URLs (state.ts)
components/        what a page can use, one per file, registered in components/index.ts
components/ui/     shadcn/ui primitives (Badge, Button, Card, Dialog, Popover, Textarea)
lib/utils.ts       cn(), shadcn's class merger; nothing else goes here
types.ts           the page.json schema and the feedback entry
examples/studio-renders/  the reference page (every component once): one sphere lit four ways, made by make.py
examples/ascii/           a short blog post: ASCII art rendered to video, made by make.py
skills/local-artifacts/   the agent skill: publish a page, share links, read feedback
```

## How it works

- **Pages.** `/?path=<abs path>` opens a page: the path of its `.mdx` file, or of its folder (then `page.mdx` in it);
  `~/…` works. `page.json` and `feedback.json` live in its folder, and media `src`s are relative to it. Every route
  that takes a page takes the same `path` parameter.
- **Recent pages.** Each page opened is remembered by folder name in `~/.artifacts-recent.json`: `/` lists them, and
  an old short link `/<name>` redirects to its `?path=` (query and `#` kept).
- **Local only.** The server listens on 127.0.0.1 and never on other interfaces, because `?path=` reads any folder.
  Data routes answer 403 unless `Host` is `127.0.0.1`, `localhost` or `[::1]` with the port, so a website that
  points its own domain at 127.0.0.1 (DNS rebinding) cannot read files.
- **Compile.** `page.mdx` is compiled on the server once per change. Frontmatter (`title`, `description`, `order`) is
  YAML: quote a value that holds `: `. On a compile error the last good version stays and the error (line:column) goes
  to a red banner and `/api/check`.
- **Data.** `GET /api/page?path=` returns the compiled MDX, `page.json`, the frontmatter, `feedback.json`, and a probe
  (size, duration, codec, or `null` when missing) for every file the page points at: each `src`/`compare` in `page.json`
  and each literal `src=`/`compare=` attribute in the MDX.
- **Render.** The MDX gets `components/index.ts` as its components and `page.json` as `props.data`. A `Section`'s
  `blocks` are looked up in the same registry.
- **Media.** Cards never load a video. `/t?path=…&src=` returns one JPEG frame made by ffmpeg (480 px high for cards,
  1600 px long side in the viewer), cached in `.review-cache/` in the page folder by size + mtime; a zoomed image loads the
  original. Videos play only in the viewer and side by side, from `/f?path=…&src=` with Range.
- **Polling.** Each tab asks every 5 s with an ETag and gets `304` unless a page file, a media file or `feedback.json`
  changed. Hidden tabs skip. Sections open once, when first seen (`open`, plus the two newest dated ones); after that the
  reader's folding is never touched.
- **Saving.** A vote or note is posted 300 ms after the last keystroke; the server merges that one entry into
  `feedback.json` and writes it atomically. Notes being typed win over a poll.

## Publish a page

```
my-run/
  page.mdx        frontmatter, prose, components (hand-written, once)
  page.json       optional; prefer writing everything in page.mdx
  feedback.json   written by the app; never write it
  in/ out/ …      your files; src is relative to the page folder and may use ../
```

**page.mdx**

```mdx
---
title: My run
description: One line under the title.
order: oldest-first        # or newest-first: which end the two auto-opened dated sections come from
---

<Section id="try-1" date="Tue 17 Nov 2026 · 10:00" title="First try" badges={["★", "❓ your call", "seed 1001"]}>
**Why:** one sentence. Write tags like `<Video 1>` inside backticks in prose.

<Gallery title="Sources">
  <Media id="orig" src="in/original.mp4" title="original" badges={["3 s"]} />
</Gallery>

<Code src="p/settings.txt" title="Settings" />

<Gallery title="Versions">
  <Media id="v1" src="out/v1.mp4" title="version 1" caption="looks right" badges={["★", "⏱ 1.2 min"]} compare="orig" />
</Gallery>
</Section>

{props.data.sections.map((s) => <Section key={s.id} {...s} />)}
```

**page.json** holds script-written text, with no MDX escaping. Schema: `PageJson` in `types.ts`; a block is
`{ "type": <component name>, ...its props }`.

```json
{ "sections": [ {
  "id": "try-2", "date": "Tue 17 Nov 2026 · 11:00", "title": "Second try", "badges": ["✅ kept", "seed 2002"],
  "blocks": [
    { "type": "Markdown", "text": "Generated text: `<Video 1>`, { } and < are fine here." },
    { "type": "Gallery", "title": "Versions", "items": [
      { "id": "v2", "src": "out/v2.mp4", "title": "version 2", "caption": "kept", "badges": ["✅", "⏱ 1.1 min"], "compare": "orig" } ] },
    { "type": "Code", "title": "Settings", "src": "p/settings.txt" }
  ] } ] }
```

**Check, then hand over the section link** (`…/?path=…/my-run/page.mdx#try-1`, not just the page):

```sh
curl -s "127.0.0.1:8800/api/check?path=$PWD/my-run"
# {"ok":true,"sections":2,"media":3,"missing":["out/v3.mp4"],"errors":[],"warnings":[],"url":"…",
#  "links":{"try-1":"http://127.0.0.1:8800/?path=/abs/my-run/page.mdx#try-1"}}
```

- `ok:false`: an MDX error (line:column), broken JSON or a duplicate id. Fix it; the page shows the last good version meanwhile.
- `missing`: files not there yet. They show as ⏳ cards and fill in by themselves, so write cards before the files exist.
- `warnings`: videos in a codec Chrome cannot play.

**Links:** `/?path=…#<section-or-card-id>` opens and scrolls to it (a card gets a ring) · `&pick=a,b` rings several
cards · `&section=<id>` works like `#<id>` · `/` lists the pages opened so far with their ❓ count and notes. Encode
spaces, `&` and `#` in the path; the `url` and `links` from `/api/check` already are.

**Keys:** viewer: ←/→ every card on the page, Ctrl/⌘+Enter saves the note and moves on, Esc closes. Every card zooms,
images and videos, with or without `compare`: Ctrl/⌘+wheel or pinch at the cursor, `+`/`-`, double-click toggles fit
and 100 %; wheel or drag pans; `0` or Esc goes back to the opening view. A strip over 3:1 opens at its width (or
height), at most 100 %, from the top. While it overflows, a minimap (a live frame for videos) shows where you are: click
or drag in it. The compare wipe is the white line: drag it. Side by side (▶ on a section with 2+ videos): one clock and
one zoom for all columns, untick columns, pick the sound, ←/→ one frame, space plays.

**Rules**

1. Point `src` at the raw files; never make thumbnails or previews.
2. Edit `page.mdx` by hand. Never feed a page from a generator/converter chain or a background watcher: one went stale and froze a page.
   `page.json` stays supported for text a one-off script writes. In MDX prose a bare `<` or `{` breaks the compile: use backticks.
3. Rewrite `page.json` only when its content changed (no clocks or counters: every change re-renders the reader's page),
   via a `.tmp` file + rename.
4. Never hide a result: a failed one stays, with a ❌ badge and a caption saying why.
5. Ids (sections, cards, notes) are feedback keys: unique on the page and stable, or old notes detach.
6. Videos in H.264, VP9 or AV1.
7. One page per project, one server for every page: add sections, not pages or ports.
8. Read `feedback.json` after every round and quote back what you acted on.
9. Run `/api/check` after every change.

## Feedback

`feedback.json` is keyed by card, section, note or comment id:

```json
{ "h-a":    { "vote": "up", "note": "keep this one", "updatedAt": "2026-11-17T10:02:11.481Z", "kind": "media",
              "section": "colours", "sectionTitle": "A gallery of images and videos", "title": "version A", "src": "out/result-a.mp4" },
  "colours": { "vote": null, "note": "try a third version", "updatedAt": "…", "kind": "section", "title": "A gallery of images and videos" },
  "c-lh8lbx": { "kind": "comment", "quote": "hand-written MDX", "prefix": " page is builtThis section is ",
              "suffix": ": Markdown plus components. Th", "section": "intro", "sectionTitle": "How this page is built",
              "note": "Say which file this lives in.", "resolved": false, "updatedAt": "2026-11-17T12:22:43.761Z" } }
```

Entries from older versions may carry `step`, `stepTitle`, `set`, or `section` holding a title; they still show.

```sh
# everything
jq -r 'to_entries[] | "[\(.value.section // .key)] \(.value.title // .value.quote) | \(.value.vote // "-") | \(.value.note)"' my-run/feedback.json
# changed since a time
jq -r --arg t "2026-11-17T09:00" 'to_entries[] | select(.value.updatedAt > $t) | "\(.key): \(.value.note)"' my-run/feedback.json
# open text comments
jq -r 'to_entries[] | select(.value.kind == "comment" and (.value.resolved | not)) | "[\(.value.section)] “\(.value.quote)” | \(.value.note)"' my-run/feedback.json
```

**Text comments.** Selecting text in a section (prose, a `Code` block, a caption, a title) opens the comment form on it
at once: type, then Save or Ctrl/⌘+Enter; Esc or a click outside closes it while it is empty. The text gets a yellow
highlight; hover shows the comment, a click pins it for edit, resolve or delete. Resolved comments stay in the file but leave the page. 💬 counts in the contents and section header include them.

**Section notes** (the box at the end of a section, kind `section`) show under the section title, as one line when the
section is folded, and under its entry in the contents; a click opens the box. Card notes show on the card. Section
notes, card notes and text comments share one look. Whitespace-only notes show nothing.

`prefix` and `suffix` are up to 30 characters around the quote, from the section's text with no separators between
elements. On every render the quote is looked up word for word in its section; if it occurs more than once, the best
matching surroundings win. If the quote is gone (reworded or removed), the comment shows as **detached** above the
section's note box. So rewording a commented sentence detaches it: say so in your reply, and the reader resolves it.

## Components

The same names work as MDX tags and as `page.json` block types.

| Component | Props (* required) | What it renders |
|---|---|---|
| `Section` | `id`*, `title`*, `date`, `badges`, `open`, `blocks`, children | A foldable chapter, listed in the contents, with a note box at the end (detached comments above it) and a side-by-side button when it holds 2+ videos. Its note shows under the title (one line when folded) and in the contents. `blocks` render before children. |
| `Gallery` | `title`, `items` (list of `Media` props), children | A row of fixed-height cards. |
| `Media` | `src`*, `id` (defaults to `src`), `title`, `caption`, `badges`, `compare` | An image or video card (by extension), its W×H on the thumbnail. Click opens the viewer; `compare` (another card's id, or a path) adds a wipe against it. |
| `Code` | `src` or `text` or children, `title` | Verbatim text folded to a few lines, with Copy. `src` is re-read when the file changes. |
| `Badge` | children (text) | A chip. Text starting with ✅ ❌ ★ ❓ is a coloured status, also shown next to titles and in the contents; ❓ counts as "waiting" on the page list. |
| `Note` | `id`*, `placeholder` | A note box saved under `id` (kind `note`). Use it to ask the reader something specific. |
| `Markdown` | `text`* | Markdown from a string, for `page.json`, where MDX is not parsed. |

`badges` is always a list of strings, each drawn as a `Badge`.

## Write a custom component

1. Create `components/<name>.tsx` exporting a function named like the file in PascalCase (`metric.tsx` → `Metric`).
2. Import it in `components/index.ts` and add it to `components`.
3. Restart the server.

Props come from the MDX attributes or the `page.json` block (every key but `type`). For page state import from
`shell/state.ts`: `useStore` (`useStore((s) => s.media[src])` for a probe, `useStore.setState({ viewing: id })` opens the
viewer), `SectionCtx` (the enclosing section), `fileUrl(src)`, `useReview(id)` / `edit(id, …)`. Build it from the
shadcn primitives in `components/ui/` and Tailwind; add `not-prose` so the article typography leaves it alone.

```tsx
// components/metric.tsx
export function Metric({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
	return <div className="not-prose mt-3 mr-2 inline-flex flex-col rounded-md border bg-muted px-3 py-2">
		<span className="text-xs text-muted-foreground">{label}</span>
		<b className="text-xl">{value}{unit && <span className="ml-1 text-sm text-muted-foreground">{unit}</span>}</b>
	</div>;
}
```

```ts
// components/index.ts
import { Metric } from "./metric";
export const components = { Badge, Code, Gallery, Markdown, Media, Metric, Note, Section };
```

Then `<Metric label="Sharpness" value={31.2} unit="dB" />` in MDX, or
`{ "type": "Metric", "label": "Sharpness", "value": 31.2, "unit": "dB" }` in `blocks`. Add a component to the repo only
when it is general and earns its place; otherwise compose the existing ones.

## Contribute

**Run it:** `bun install`, then `nohup bun server.ts > /tmp/artifacts.log 2>&1 &`. Client code is bundled at start, so
restart after any change outside the page folders; stop it by PID (`pgrep -f "bun server.ts"`, then `kill <pid>`) as its
own command.

**Code rules:**

- Page components live in `components/`, one per file, export named like the file, registered only in
  `components/index.ts`. The shell (layout, contents, viewer, side by side) lives in `shell/`. UI pieces come from the
  shadcn/ui primitives in `components/ui/` (add one with its shadcn source, trimmed to what is used), not custom CSS.
- Formatted by Biome (`bunx biome check --write .`); lines stay under ~110 characters, files small and read top to
  bottom.
- General only: nothing about one project. Project-specific shapes belong in a converter in that project.
- No abstraction without a second use, no dead code, no defensive checks for things that cannot happen.
- Comments only where the why is not obvious: one or two plain-English lines above the code, prefixed `[Agent]` when an
  agent wrote them.
- `feedback.json` stays backward compatible: entries are keyed by id and merged, never rewritten wholesale.

**Verify:**

```sh
bunx -p typescript tsc --noEmit -p . && bunx biome check . && bun test
curl -s "127.0.0.1:8800/api/check?path=$PWD/examples/studio-renders"   # ok:true (out/upscale-2x.mp4 missing on purpose)
curl -s "127.0.0.1:8800/api/check?path=$PWD/examples/ascii"            # ok:true, nothing missing
```

`bun test` (server.test.ts) starts the server with a temp `HOME` and checks `?path=`, `/api/check`, the JPEG
thumbnail, Range, the Host 403 and an old link. Then click through
`http://127.0.0.1:8800/?path=$PWD/examples/studio-renders` (a browser or headless Chrome): a card opens the viewer, `compare` shows
the wipe, a note saves to `examples/studio-renders/feedback.json` (git-ignored), side by side plays in sync, a text comment
survives a reload, a section note shows under its title and in the contents, no console errors. If the look changed,
retake `docs/screenshot.png` from that page (1400 px wide, contents visible, one section open, one text comment and one
section note showing), then delete the test notes.

**Commits:** small [conventional commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `refactor:`, `docs:`,
`chore:`; `!` for a breaking change to the page format), one concern each.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Stuck on "Loading …" | The first request probes every file with ffprobe (8 at a time), so hundreds of new files take a while once. Try `/api/check?path=…` and read `/tmp/artifacts.log`. |
| "Not found: page.mdx at …" | No `.mdx` at that path, or the folder has no `page.mdx`; check for an unencoded space, `&` or `#`. An old `/<name>` link 404s until its page is opened once by `?path=`. "Failed to fetch": the server is down. |
| Red banner `page.mdx L:C …` | A bare `<` or `{` in prose, an unclosed tag, or a broken `{…}` expression. |
| "failed to render: Expected component `X` to be defined" | `X` is not in `components/index.ts`. Any other "failed to render" is a component that threw. |
| "Unknown block type" | A `page.json` block's `type` is not a registered component. |
| ⚠ codec chip | Re-encode: `ffmpeg -i in.mov -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart out.mp4`. |
| ⏳ card never fills | Wrong `src` (relative to the page folder); `/api/check` lists it under `missing`. |
| Old notes gone from a card | Its id changed; restore the old id. |
