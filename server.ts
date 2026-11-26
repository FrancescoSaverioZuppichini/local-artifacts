#!/usr/bin/env bun
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { compile } from "@mdx-js/mdx"
import { $, type BunRequest } from "bun"
import pLimit from "p-limit"
import rehypeSlug from "rehype-slug"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import index from "./index.html"
import { type Feedback, type PageJson, type Probe, playable } from "./types"

const PORT = Number(process.env.PORT ?? 8800)
const MEDIA = /\.(png|jpe?g|webp|avif|gif|bmp|tiff?|mp4|webm|mov|m4v|mkv)$/i
const VIDEO = /\.(mp4|webm|mov|m4v|mkv)$/i
// [Agent] 300 cards opened at once would otherwise fork 300 ffprobe or ffmpeg processes.
const probeSlot = pLimit(8)
const thumbSlot = pLimit(4)

// [Agent] Size catches most of two writes inside the same millisecond, which mtime alone misses.
function getStamp(file: string) {
	const s = statSync(file, { throwIfNoEntry: false })
	return s?.isFile() ? `${s.size}-${Math.floor(s.mtimeMs)}` : ""
}
const missing = (what: string) => Response.json({ error: `Not found: ${what}` }, { status: 404 })

// [Agent] DNS rebinding: any website can point its own domain at 127.0.0.1 and then read files through ?path=.
// Its requests still carry that domain in Host, so only loopback names get an answer.
const HOSTS = [`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`]
function local<T extends string>(handle: (request: BunRequest<T>) => Response | Promise<Response>) {
	return (request: BunRequest<T>) =>
		HOSTS.includes(request.headers.get("host") ?? "")
			? handle(request)
			: Response.json({ error: "Forbidden: Host must be 127.0.0.1, localhost or [::1]" }, { status: 403 })
}

// [Agent] Every page opened by path, keyed by its folder name: old /<name> links redirect through it and / lists
// it. In the home folder so any clone shares it and a test can swap HOME; written only when a page is new or moved.
const RECENT = join(homedir(), ".artifacts-recent.json")
const recent: Record<string, string> = existsSync(RECENT) ? JSON.parse(readFileSync(RECENT, "utf8")) : {}

// [Agent] `path` is the .mdx file or its folder; trimmed because a link pasted from a chat often ends in a space.
function getPage(path: string | null) {
	const full = path && resolve(path.trim().replace(/^~(?=\/|$)/, homedir()))
	const file = full && (full.endsWith(".mdx") ? full : join(full, "page.mdx"))
	if (!file || !existsSync(file)) return undefined
	const name = basename(dirname(file))
	if (recent[name] !== file) {
		recent[name] = file
		writeFileSync(RECENT, `${JSON.stringify(recent, null, 2)}\n`)
	}
	return file
}
const pageUrl = (file: string) =>
	`http://127.0.0.1:${PORT}/?path=${encodeURIComponent(file).replaceAll("%2F", "/")}`

// [Agent] Cards get their aspect ratio from the probe before any pixel loads, so nothing shifts. A file that
// is not there yet, or is still being written, is null: ⏳.
const probes = new Map<string, Probe>()
async function probe(file: string): Promise<Probe | null> {
	const stamp = getStamp(file)
	if (!stamp) return null
	const v = Bun.hash(stamp).toString(36)
	if (probes.get(file)?.v === v) return probes.get(file)!
	const video = VIDEO.test(file)
	let result: Probe = { v, video, w: 0, h: 0 }
	if (MEDIA.test(file)) {
		const fields = "stream=width,height,codec_name:format=duration"
		const read = () =>
			$`ffprobe -v error -select_streams v:0 -show_entries ${fields} -of json ${file}`.quiet()
		const out = await probeSlot(read).catch(() => null)
		if (!out) return null
		const { streams: [{ width = 0, height = 0, codec_name = "" } = {}] = [], format } = out.json()
		result = { ...result, w: width, h: height }
		if (video) result = { ...result, codec: codec_name, dur: Number(format?.duration) || 0 }
	}
	probes.set(file, result)
	return result
}

// [Agent] Parsed once per change. On an error the last good value stays and the error goes to the page banner
// and /api/check.
type Parsed<T> = { stamp: string; raw: string; value: T; error?: string }
const parsed = new Map<string, Parsed<unknown>>()
async function parseFile<T>(file: string, parse: (raw: string) => T | Promise<T>, empty: T) {
	const stamp = getStamp(file)
	const old = parsed.get(file) as Parsed<T> | undefined
	if (old?.stamp === stamp) return old
	const raw = stamp ? readFileSync(file, "utf8") : ""
	let entry: Parsed<T>
	try {
		entry = { stamp, raw, value: await parse(raw) }
	} catch (e) {
		entry = { stamp, raw, value: old?.value ?? empty, error: `${basename(file)} ${(e as Error).message}` }
	}
	parsed.set(file, entry)
	return entry
}

type Meta = { title?: string; description?: string; order?: string }
function readMeta(raw: string): Meta {
	const yaml = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1]
	return (yaml && Bun.YAML.parse(yaml)) || {}
}
const readJson = (raw: string): PageJson => (raw ? JSON.parse(raw) : {})

async function compileMdx(raw: string) {
	const meta = readMeta(raw)
	const plugins = { remarkPlugins: [remarkFrontmatter, remarkGfm], rehypePlugins: [rehypeSlug] }
	const code = await compile(raw, { outputFormat: "function-body", ...plugins }).catch((e) => {
		throw Error(`${e.line}:${e.column} ${e.reason}`)
	})
	return { code: String(code), meta }
}

function readFeedback(dir: string): Record<string, Feedback> {
	try {
		return JSON.parse(readFileSync(join(dir, "feedback.json"), "utf8"))
	} catch {
		return {}
	}
}

// [Agent] Everything a page points at. page.json is walked whole, so custom components count too; the MDX
// side is a regex over literal attributes of capitalised tags, which is where agents are told to write them.
function scanRefs(raw: string, data: PageJson) {
	const ids: string[] = []
	const files = new Set<string>()
	const refs: string[] = []
	const badges: unknown[] = []
	const walk = (v: unknown): void => {
		if (!v || typeof v !== "object") return
		const o = v as Record<string, unknown>
		if (typeof o.id === "string") ids.push(o.id)
		if (typeof o.src === "string") files.add(o.src)
		if (typeof o.compare === "string") refs.push(o.compare)
		if (Array.isArray(o.badges)) badges.push(...o.badges)
		Object.values(o).forEach(walk)
	}
	walk(data)
	const attr = (name: string, tag = "[A-Z]\\w*") =>
		[...raw.matchAll(new RegExp(`<${tag}\\b[^>]*?\\b${name}=["']([^"']+)["']`, "g"))].map((m) => m[1])
	ids.push(...attr("id"))
	for (const src of attr("src")) files.add(src)
	refs.push(...attr("compare"))
	for (const ref of refs) if (!ids.includes(ref)) files.add(ref)
	return {
		ids,
		sections: [...attr("id", "Section"), ...(data.sections ?? []).map((s) => s.id)],
		files: [...files].filter((f) => !/^https?:/.test(f)),
		waiting: [...badges, ...(raw.match(/badges=\{\[[^\]]*\]\}/g) ?? [])].join().split("❓").length - 1,
	}
}

async function build(file: string) {
	const dir = dirname(file)
	const mdx = await parseFile(file, compileMdx, { code: "", meta: {} as Meta })
	const data = await parseFile(join(dir, "page.json"), readJson, {})
	const found = scanRefs(mdx.raw, data.value)
	const probed = await Promise.all(found.files.map((src) => probe(resolve(dir, src))))
	const media = Object.fromEntries(found.files.map((src, i) => [src, probed[i] || null]))
	const dupes = new Set(found.ids.filter((id, i) => found.ids.indexOf(id) !== i))
	const errors = [mdx.error, data.error, ...[...dupes].map((id) => `duplicate id: ${id}`)].filter(Boolean)
	return { file, dir, ...mdx.value, data: data.value, media, errors: errors as string[], found }
}

function check({ file, media, errors, found }: Awaited<ReturnType<typeof build>>) {
	const url = pageUrl(file)
	const files = Object.entries(media)
	return {
		ok: !errors.length,
		sections: found.sections.length,
		media: found.files.filter((f) => MEDIA.test(f)).length,
		missing: files.filter(([, p]) => !p).map(([src]) => src),
		errors,
		warnings: files
			.filter(([, p]) => !playable(p?.codec))
			.map(([src, p]) => `${src}: ${p?.codec} does not play in Chrome, re-encode to H.264`),
		url,
		links: Object.fromEntries(found.sections.map((id) => [id, `${url}#${id}`])),
	}
}

// [Agent] A tab that already has this exact body gets an empty 304, so the 5 s poll costs nothing.
function sendJson(request: Request, body: unknown) {
	const text = JSON.stringify(body)
	const headers = { etag: `"${Bun.hash(text).toString(36)}"`, "cache-control": "no-cache" }
	if (request.headers.get("if-none-match") === headers.etag)
		return new Response(null, { status: 304, headers })
	return new Response(text, { headers: { ...headers, "content-type": "application/json; charset=utf-8" } })
}

// [Agent] Bun ignores Range on a file response, and browsers need it to seek video.
function sendFile(request: Request, file: string) {
	const f = Bun.file(file)
	const etag = `"${f.size}-${Math.floor(f.lastModified)}"`
	const headers = {
		"Accept-Ranges": "bytes",
		"Cache-Control": "no-cache",
		ETag: etag,
		"Content-Type": f.type,
	}
	if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers })
	const [, from, to] = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "") ?? []
	if (from === undefined) return new Response(f, { headers })
	const start = from ? Number(from) : Math.max(0, f.size - Number(to))
	const end = from && to ? Math.min(Number(to), f.size - 1) : f.size - 1
	if ((!from && !to) || start > end) {
		return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${f.size}` } })
	}
	const partial = { ...headers, "Content-Range": `bytes ${start}-${end}/${f.size}` }
	return new Response(f.slice(start, end + 1), { status: 206, headers: partial })
}

// [Agent] Cards have a fixed height, so their thumbnails scale by height (a wide strip stays sharp); the
// viewer's by the long side. The name holds the probe stamp, so the URL (with ?v=) is cached forever.
const thumbs = new Map<string, Promise<string>>()
async function getThumb(dir: string, file: string, view: boolean) {
	const p = await probe(file)
	if (!p) throw Error("not ready")
	const out = join(dir, ".review-cache", `${Bun.hash(`${file}|${p.v}|${view}`).toString(36)}.jpg`)
	if (existsSync(out)) return out
	const scale = view
		? "scale='if(gt(iw,ih),min(1600,iw),-2)':'if(gt(iw,ih),-2,min(1600,ih))'"
		: "scale=-2:'min(480,ih)'"
	// [Agent] Only videos get a seek: "-ss 0" before a still JPEG makes ffmpeg write an empty file and exit 0.
	const seek = p.video ? ["-ss", String(Math.min(1, (p.dur ?? 0) / 3))] : []
	const make = async () => {
		await mkdir(dirname(out), { recursive: true })
		await $`ffmpeg -v error -y ${seek} -i ${file} -frames:v 1 -vf ${scale} -q:v 4 -f mjpeg ${out}.tmp`.quiet()
		renameSync(`${out}.tmp`, out)
		return out
	}
	if (!thumbs.has(out))
		thumbs.set(
			out,
			thumbSlot(make).finally(() => thumbs.delete(out)),
		)
	return thumbs.get(out)!
}

// [Agent] src rides in the query, relative to the page folder, so "../" survives (browsers collapse it in a path).
function getFile(url: URL) {
	const page = getPage(url.searchParams.get("path"))
	const file = page && resolve(dirname(page), url.searchParams.get("src") ?? "")
	return page && file && existsSync(file) ? { dir: dirname(page), file } : undefined
}

Bun.serve({
	port: PORT,
	hostname: "127.0.0.1",
	development: false,
	idleTimeout: 60,
	routes: {
		"/": index,
		// [Agent] Short links from before ?path=: the query rides along and the browser keeps the #fragment.
		"/:name": local((request) => {
			const file = recent[request.params.name.trim()]
			const rest = new URL(request.url).search.replace("?", "&")
			return file ? Response.redirect(`${pageUrl(file)}${rest}`, 302) : missing(`page ${request.params.name}`)
		}),
		// [Agent] The list reads only frontmatter, page.json and feedback.json. Building every page compiled all
		// the MDX and ffprobed every media file of every page: 8 s after each restart, for a title and two counts.
		"/api/pages": local(async (request) => {
			const list = await Promise.all(
				Object.values(recent)
					.filter(existsSync)
					.map(async (file) => {
						const dir = dirname(file)
						const raw = readFileSync(file, "utf8")
						const data = await parseFile(join(dir, "page.json"), readJson, {})
						// [Agent] Broken YAML falls back to the folder name here; the page banner shows the error.
						const meta: Meta = await Promise.try(readMeta, raw).catch(() => ({}))
						return {
							path: file,
							title: meta.title ?? basename(dir),
							description: meta.description ?? "",
							updated: Math.max(
								...[file, join(dir, "page.json")].map(
									(f) => statSync(f, { throwIfNoEntry: false })?.mtimeMs ?? 0,
								),
							),
							waiting: scanRefs(raw, data.value).waiting,
							notes: Object.values(readFeedback(dir)).filter((r) => r.note?.trim()).length,
						}
					}),
			)
			return sendJson(
				request,
				list.sort((a, b) => b.updated - a.updated),
			)
		}),
		"/api/page": local(async (request) => {
			const path = new URL(request.url).searchParams.get("path")
			const page = getPage(path)
			if (!page) return missing(`page.mdx at ${path}`)
			const { dir, code, meta, data, media, errors } = await build(page)
			const { title = basename(dir), description = "", order = "" } = meta
			const feedback = readFeedback(dir)
			return sendJson(request, { title, description, order, code, data, media, errors, feedback })
		}),
		"/api/check": local(async (request) => {
			const path = new URL(request.url).searchParams.get("path")
			const page = getPage(path)
			return page ? Response.json(check(await build(page))) : missing(`page.mdx at ${path}`)
		}),
		"/api/feedback": {
			POST: local(async (request) => {
				const { path, id, delete: drop, ...entry } = await request.json()
				const page = getPage(path)
				if (!page || typeof id !== "string" || !id) return missing("page or id")
				const dir = dirname(page)
				// [Agent] Reread, merge and write in one synchronous step, so overlapping saves cannot clobber each
				// other; the rename means nobody reads half a file. Fields older versions wrote survive the spread.
				const all = readFeedback(dir)
				if (drop) delete all[id]
				else all[id] = { ...all[id], ...entry, updatedAt: new Date().toISOString() }
				writeFileSync(join(dir, "feedback.json.tmp"), `${JSON.stringify(all, null, 2)}\n`)
				renameSync(join(dir, "feedback.json.tmp"), join(dir, "feedback.json"))
				return Response.json(all[id] ?? null)
			}),
		},
		"/f": local((request) => {
			const found = getFile(new URL(request.url))
			return found ? sendFile(request, found.file) : missing("file")
		}),
		"/t": local(async (request) => {
			const url = new URL(request.url)
			const found = getFile(url)
			const view = url.searchParams.get("s") === "view"
			const out = found && (await getThumb(found.dir, found.file, view).catch(() => ""))
			if (!out) return missing("thumbnail")
			const headers = { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" }
			return new Response(Bun.file(out), { headers })
		}),
	},
	error: (error) => Response.json({ error: error.message }, { status: 400 }),
})
console.log(`http://127.0.0.1:${PORT}`)
