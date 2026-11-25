---
name: local-artifacts
description: Publish anything the user needs to SEE as a live page in the local-artifacts app (http://127.0.0.1:8800) and read the 👍/👎, notes and comments the user leaves on it. Use it for renders, images, videos, a design, a landing page, a brand kit, an A/B test or a comparison of runs or models, "show me", a set of results to review or pick from, several things side by side, or an experiment log or report with media. Use it instead of pasting file paths, opening Preview or describing images in chat, even when the user doesn't name the app. Also use it at the start of every round on an existing page, to read its feedback.json.
---

# Local artifacts

[local-artifacts](https://github.com/FrancescoSaverioZuppichini/local-artifacts) shows any `page.mdx` on this machine as a live
page at `http://127.0.0.1:8800/?path=/abs/path/to/page.mdx` (the folder's path works too). It gives you foldable
sections, galleries, a full-screen viewer with a compare wipe, a synced side-by-side video player, and 👍/👎, notes
and text comments, all saved to `feedback.json` next to the page. Every 5 s it checks the page, its media and the
feedback, and re-renders when any of them changes. The full reference is the repo's [AGENTS.md](https://github.com/FrancescoSaverioZuppichini/local-artifacts/blob/main/AGENTS.md)
(`AGENTS.md` at the repo root in a local clone).

## The hard rule: the page is one hand-edited page.mdx

Publishing means editing `page.mdx` with your file tools, and nothing else. **Never write a generator, a converter
or a background watcher to feed the page.** That means no `make_page.py`, no `results.json → page.json` chain and
no `while true` loop. A stale watcher once kept running old code and froze a page while new results kept
landing. The app already watches the files, so a script in between only adds another way for the page to go
stale. Don't use `page.json` either: the examples use it for script output, which you don't have. You don't need
a build, a restart, thumbnails or previews: the app makes its own JPEG thumbnails from the raw files.

## Publish

1. Check that the server is up: `curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:8800/` should print `200`.
   If it doesn't, start it from the root of a clone of the repo:
   `bun install && nohup bun server.ts > /tmp/artifacts.log 2>&1 &`
2. Put the page in `~/Documents/local-artifacts/<project>/` unless the user names another folder: one subfolder per
   project or research topic, created if missing. New work on the same project is a new section, not a new folder.
   Never put it in a code repo or a temp/scratch folder unless asked: repos fill up with renders and scratch gets
   wiped. If `~/Documents` syncs to iCloud, ask for a folder outside it, because renders run to gigabytes.
3. Write `page.mdx`, then run the check below.

```mdx
---
title: "Relight: three models"   # YAML: quote any value that contains ": "
description: One line under the title.
order: newest-first              # you keep the newest section on top; the two newest dated ones open by themselves
---

<Section id="r2" date="Wed 18 Nov 2026 · 14:00" title="Round 2 · rim light ✅ B" badges={["✅ B", "seed 1001"]}>
**Why:** one sentence. Plain Markdown prose works here.

<Gallery title="Inputs">
  <Media id="r2-photo" src="in/photo.jpg" title="input photo" />
</Gallery>

<Gallery title="Outputs">
  <Media id="r2-a" src="out/r2-a.png" title="A · baseline" caption="⚠ flat skin" badges={["⏱ 41 s"]} compare="r2-photo" />
  <Media id="r2-b" src="out/r2-b.png" title="B · + rim" caption="✅ keeps the face" badges={["✅", "⏱ 44 s"]} compare="r2-a" />
</Gallery>

<Code title="Prompt" src="prompts/r2.txt" />
<Note id="r2-pick" placeholder="Which one goes to the upscale?" />
</Section>
```

The components:

- **`Section`** takes `id`\*, `title`\*, `date`, `badges` and `open` (starts unfolded). It is a foldable chapter
  listed in the sidebar, with a note box at the end, and it gets a ▶ Side by side button when it holds 2+ videos.
- **`Gallery`** takes `title` and holds `Media` children, shown as a row of fixed-height cards.
- **`Media`** takes `src`\*, `id` (defaults to `src`), `title`, `caption`, `badges` and `compare`. It shows an
  image or a video, picked by the file extension. A click opens the full-screen viewer: ←/→ move through every
  card, each card has 👍/👎 and a note, and every card zooms and pans, videos and wipes too. `compare` takes another
  card's id, or a path, and adds a wipe against it.
- **`Code`** takes `src="file.txt"` (re-read when the file changes) or ``text={`…`}``. It shows verbatim text
  folded to a few lines, with a Copy button. Use it for prompts, settings and logs.
- **`Note`** takes `id`\* and `placeholder`. It is a box that asks the reader one specific question.
- **`Badge`** is an inline chip in prose. A badge that starts with ✅ ❌ ★ ❓ is a coloured status, also shown
  next to the title and in the sidebar. ❓ ("your call") counts as waiting on the page list at `/`.

**Paths.** `src` is relative to the page folder, and `../` is fine. Point at the raw files. Videos must be H.264, VP9 or AV1 to play; `/api/check` warns about anything
else. Re-encode with `ffmpeg -i in.mov -c:v libx264 -pix_fmt yuv420p -movflags +faststart out.mp4`.

**Missing files are fine.** A `src` that doesn't exist yet shows as a ⏳ card and fills in by itself when the file
lands, so write the cards when you queue the renders.

**MDX escaping.** Prose is MDX, not Markdown: `<` followed by a letter opens a tag, and `{` opens a JS
expression (an unknown name crashes the render).

- In prose, wrap tags and braces in backticks (`` `<Video 1>` ``, `` `{seed}` ``) or escape them as `\<` and `\{`.
- `"…"` attribute values are literal, but they can't hold `"` or a line break. Put long or multi-line text such as
  prompts in a `.txt` file and show it with `<Code src>`. Inside ``text={`…`}``, escape `` ` `` and `${`.
- Ids are the keys feedback is stored under. Keep them unique on the page and never change them, or their notes
  come loose from the cards. Prefix them with the round (`r2-a`) so they never collide.

## Custom components

Write one only when the built-ins can't show the thing (a metric tile, a chart, a score table); otherwise compose
`Section`, `Gallery`, `Media`, `Code` and `Note`. A component lives in the app's clone, not in the page folder, so
every page on the server can use it.

1. Find the clone the server runs from:
   `lsof -a -p "$(pgrep -f 'bun server.ts' | head -1)" -d cwd -Fn | sed -n 's/^n//p'`
2. Create `components/<name>.tsx` there, exporting a function named like the file in PascalCase (`metric.tsx` →
   `Metric`). Its props are the MDX attributes. Build it from the shadcn/ui primitives in `components/ui/` and
   Tailwind, and put `not-prose` on its root so the article typography leaves it alone.
3. Register it in `components/index.ts`: import it and add it to `components`.
4. Restart the server, because client code is bundled at start: `pgrep -f "bun server.ts"`, then `kill <pid>` as its
   own command, then start it again from the clone root (§ Publish, step 1).
5. Use it in `page.mdx` like a built-in, `<Metric label="Sharpness" value={31.2} unit="dB" />`, and run the check.

```tsx
// components/metric.tsx
export function Metric({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
	return <div className="not-prose mt-3 mr-2 inline-flex flex-col rounded-md border bg-muted px-3 py-2">
		<span className="text-xs text-muted-foreground">{label}</span>
		<b className="text-xl">{value}{unit && <span className="ml-1 text-sm text-muted-foreground">{unit}</span>}</b>
	</div>;
}
```

Keep it general, with no project names or paths baked in: every page sees it, and it is a change in the clone (`git
status` there shows it). For page state (a media probe, the enclosing section, `fileUrl`) see AGENTS.md § Write a
custom component.

## Check after every edit

```sh
curl -s "127.0.0.1:8800/api/check?path=/abs/path/to/page.mdx"
# {"ok":true,"sections":3,"media":9,"missing":["out/r2-c.png"],"errors":[],"warnings":[],
#  "url":"http://127.0.0.1:8800/?path=/abs/path/to/page.mdx","links":{"r2":"…/?path=/abs/path/to/page.mdx#r2", …}}
```

- **`ok:false` or `errors`**: an MDX error (with line:column) or a duplicate id. Fix it now: the reader keeps
  seeing the last good version, so a broken edit is invisible to the user.
- **`missing`**: files that don't exist yet (⏳); if one should exist by now, its `src` is wrong. **`warnings`**:
  videos in a codec Chrome can't play.

## Share links

Give the section link from `links`, never just the page: `http://127.0.0.1:8800/?path=<abs path>#<section-id>`
(`&section=<id>` does the same). `#<card-id>` opens the page at one card and rings it, and `&pick=a,b` rings
several cards. A path with spaces or `&`, `#` must be URL-encoded; the `links` already are.

## A/B tests and comparisons

- Use one section per question. Show the inputs first (the photo, the prompt in `Code`, the settings), then the
  outputs.
- Put the baseline first. Keep the arms in the same order, with the same caption format, in every gallery and
  every section. Change one variable per arm and name it in the title (`B · + rim`).
- Give every arm `compare="<baseline-id>"`: the viewer's wipe then drags one image over the other at full size.
  To judge an edit against its source, compare it with the input card instead.
- With several input photos, make one gallery per photo and keep the arms in the same order in each.
- Two or more videos in one section get **▶ Side by side**: one clock drives every column, ←/→ step one frame, you
  can untick columns and pick whose sound plays. Put the baseline video first.
- Put a verdict in titles and captions (`✅ kept`, `⚠ partial`, `❌ face drifts`) and say why in the caption. A
  failed result stays on the page with ❌; never hide one.
- Put the generation time on every result card as a badge (`⏱ 44 s`) **the moment its file lands**: a result with
  no ⏱ reads as unfinished. When several jobs run in a batch, wake up after each job, not at the end of the batch.
- Next to the ⏱, give the change against the baseline card and name it (`−21.6 % vs base`), never against the
  previous arm. Put arm-to-arm deltas in the caption.
- When more than one machine renders, say which on every card (`GPU 3090`) and in the gallery title: times from
  two machines are not comparable.
- When the outputs are made from a source (a clip, a photo), make the source the first card of the gallery.
- The cards show each file's resolution by themselves; don't type it into titles.

## Read the feedback

The app is the only writer of `feedback.json` in the page folder. It holds one entry per id, with `updatedAt` on every entry:

| `kind` | Comes from | Fields |
|---|---|---|
| `media` | a card in the viewer | `vote` (`up`, `down` or `null`), `note`, `title`, `src`, `section`, `sectionTitle` |
| `section` | the note box at the end of a section | `note`, `title` |
| `note` | a `<Note id>` box | `note` |
| `comment` | text the user selected in prose, a caption, a title or a `Code` block | `quote`, `prefix`/`suffix` (up to 30 characters each side), `note`, `section`, `resolved` |

```sh
jq -r 'to_entries[] | "[\(.value.section // .key)] \(.value.title // .value.quote) | \(.value.vote // "-") | \(.value.note)"' feedback.json
jq -r --arg t "2026-11-18T09:00" 'to_entries[] | select(.value.updatedAt > $t) | "\(.key): \(.value.note)"' feedback.json
jq -r 'to_entries[] | select(.value.kind == "comment" and (.value.resolved | not)) | "[\(.value.section)] “\(.value.quote)” | \(.value.note)"' feedback.json
```

- Read it at the start of every round, before you plan. Act on every new vote and note, then tell the user what changed,
  quoting what you acted on.
- Never write, edit or delete `feedback.json`, and never rename an id that has feedback.
- A text comment is anchored to the words it quotes. If you reword that sentence, the comment shows as
  **detached**, so say so when you do it.

## Habits

- Put pictures on the page early, and add each result as it lands. A page full of ⏳ tells the user nothing.
- Look at every image yourself before you claim anything about it: Read the file, and for a video pull 2–3 frames
  with ffmpeg into your scratch folder. A verdict is what you saw, not what a log said.
- Show the inputs next to the outputs, every time.
- Run `/api/check` after every edit, and fix every error before you hand the page over.
- Keep the newest results on top (`order: newest-first`), and date every result section.
