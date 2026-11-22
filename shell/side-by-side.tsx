import { type RefObject, useEffect, useLayoutEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Controls, fullScreen, select } from "./player"
import { fileUrl, type Group, registry, type Side, useStore } from "./state"
import { MAX, name, VideoPicker } from "./video-picker"

const START = 4
const CAPTION = 26

// [Agent] The video cards under an element, read from the DOM after each render: the probe decides what is a
// video, and MDX children are opaque.
export function useVideos(ref: RefObject<HTMLElement | null>) {
	const [ids, setIds] = useState<string[]>([])
	useLayoutEffect(() => {
		const found = [...ref.current!.querySelectorAll<HTMLElement>("[data-card][data-video]")].map(
			(el) => el.id,
		)
		if (found.join() !== ids.join()) setIds(found)
	})
	return ids
}

// [Agent] Groups are read from the page when the player opens, one per gallery in page order, so a page edit
// while it is open cannot pull columns away. With no start, a small section shows every video and a big one
// its first gallery: a 150-video section must not open as 150 columns.
export function openSide(root: HTMLElement, title: string, start?: string[]) {
	const groups = new Map<Element | null, Group>()
	for (const card of root.querySelectorAll<HTMLElement>("[data-card][data-video]")) {
		const gallery = card.closest<HTMLElement>("[data-gallery]")
		if (!groups.has(gallery)) groups.set(gallery, { title: gallery?.dataset.gallery || "Videos", ids: [] })
		groups.get(gallery)!.ids.push(card.id)
	}
	const list = [...groups.values()]
	const all = list.flatMap((g) => g.ids)
	const first = Math.min(START, Math.max(2, list[0].ids.length))
	const shown = start ?? all.slice(0, all.length <= START ? START : first)
	useStore.setState({ side: { title, groups: list, shown: shown.slice(0, MAX) } })
}

// [Agent] Starts from one row, the natural way to compare, and wraps into more rows only when that makes every
// video clearly bigger (15 %): tall clips stay in a row, wide ones and narrow windows stack. Rows are filled
// evenly, so 6 videos make 3 + 3, not 4 + 2.
function fit(n: number, width: number, height: number, ratio: number) {
	let best = n
	let size = 0
	for (let rows = 1; rows <= n; rows++) {
		const cols = Math.ceil(n / rows)
		const fits = Math.min(width / cols, (height / rows - CAPTION) * ratio)
		if (fits > size * 1.15) [best, size] = [cols, fits]
	}
	return best
}

// [Agent] The picked videos on one clock, so versions of the same clip can be audited frame against frame.
// Columns keep page order, so the baseline stays first; the sound pick decides the clock.
function Row({ title, groups, shown: start }: Side) {
	const [shown, setShown] = useState(start)
	const [pick, setPick] = useState(start[0])
	const [videos, setVideos] = useState<HTMLVideoElement[]>([])
	// [Agent] The dialog portal mounts its content a render late, so the stage is kept in state, not a ref.
	const [stage, setStage] = useState<HTMLDivElement | null>(null)
	const [size, setSize] = useState({ width: 1, height: 1 })
	const gallery = new Map(groups.flatMap((g) => g.ids.map((id) => [id, g.title])))
	const columns = groups.flatMap((g) => g.ids).filter((id) => shown.includes(id))
	const voice = shown.includes(pick) ? pick : columns[0]
	const mixed = new Set(columns.map((id) => gallery.get(id))).size > 1
	const probe = useStore((s) => s.media[registry.get(columns[0])!.src!])
	const cols = fit(columns.length, size.width, size.height, probe ? probe.w / probe.h : 9 / 16)

	useEffect(() => {
		if (!stage) return
		const observer = new ResizeObserver(([e]) => setSize(e.contentRect))
		observer.observe(stage)
		return () => observer.disconnect()
	}, [stage])

	useEffect(() => {
		const all = [...(stage?.querySelectorAll("video") ?? [])]
		const clock = all[columns.indexOf(voice)] ?? all[0]
		setVideos(clock ? [clock, ...all.filter((v) => v !== clock)] : [])
	}, [stage, shown, voice])

	return (
		<Dialog open onOpenChange={(open) => open || useStore.setState({ side: null })}>
			<DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className={`${fullScreen} bg-black`}>
				<header className="flex flex-wrap items-center gap-2 bg-popover px-3 py-2 text-sm">
					<DialogTitle className="max-w-[48ch] min-w-0 truncate text-sm" title={title}>
						{title}
					</DialogTitle>
					<VideoPicker groups={groups} shown={shown} onChange={setShown} />
					<label className="flex items-center gap-1.5 text-muted-foreground">
						Sound
						<select className={`${select} max-w-48`} value={voice} onChange={(e) => setPick(e.target.value)}>
							{columns.map((id) => (
								<option key={id} value={id}>
									{name(id)}
								</option>
							))}
						</select>
					</label>
					<Button className="ml-auto" onClick={() => useStore.setState({ side: null })}>
						Close (Esc)
					</Button>
				</header>
				<div
					ref={setStage}
					className="grid min-h-0 flex-1 gap-1"
					style={{
						gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
						gridTemplateRows: `repeat(${Math.ceil(columns.length / cols)}, minmax(0, 1fr))`,
					}}
				>
					{columns.map((id) => (
						<figure key={id} className="flex min-h-0 min-w-0 flex-col">
							<figcaption
								className="flex items-center gap-2 bg-popover px-2 text-[13px]"
								style={{ height: CAPTION }}
								title={[name(id), registry.get(id)!.caption].filter(Boolean).join(" · ")}
							>
								<b className="max-w-full shrink-0 truncate font-semibold">{name(id)}</b>
								{mixed && <span className="min-w-0 truncate text-muted-foreground">{gallery.get(id)}</span>}
							</figcaption>
							<video
								src={fileUrl(registry.get(id)!.src!)}
								loop
								muted
								playsInline
								preload="auto"
								className="min-h-0 w-full flex-1 bg-black object-contain"
							/>
						</figure>
					))}
				</div>
				<Controls videos={videos} keys />
			</DialogContent>
		</Dialog>
	)
}

export function SideBySide() {
	const side = useStore((s) => s.side)
	return side && <Row {...side} />
}
