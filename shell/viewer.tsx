import { type PointerEvent, useEffect, useState } from "react"
import { Badges } from "@/components/badge"
import { Note } from "@/components/note"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { Probe } from "@/types"
import { Controls, fullScreen } from "./player"
import { cards, fileUrl, flush, registry, thumbUrl, typing, useStore } from "./state"
import { Votes } from "./votes"
import { HOME, Zoom } from "./zoom"

const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }
const label = "absolute top-2 rounded bg-black/70 px-1.5 text-[11px] font-semibold"

// [Agent] A still shows its 1600 px viewer thumbnail while it fits; once it overflows, the original loads on top.
function Asset({ src, probe, big }: { src: string; probe: Probe; big: boolean }) {
	const className = "absolute inset-0 size-full bg-black object-contain"
	if (probe.video)
		return <video src={fileUrl(src)} className={className} muted loop playsInline autoPlay preload="auto" />
	return (
		<>
			<img src={thumbUrl(src, probe, true)} className={className} alt="" />
			{big && <img src={fileUrl(src)} className={className} alt="" />}
		</>
	)
}

// [Agent] The reference on top of the card, clipped to the left of the wipe. The line is a handle that keeps its
// screen width at any zoom (24 px to grab, 2 px to see), so a drag anywhere else still pans.
function Wipe({ src, probe, s, big }: { src: string; probe: Probe; s: number; big: boolean }) {
	const [split, setSplit] = useState(50)
	const drag = (e: PointerEvent<HTMLElement>) => {
		if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
		const r = e.currentTarget.parentElement!.getBoundingClientRect()
		setSplit(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)))
	}
	return (
		<>
			<div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
				<Asset src={src} probe={probe} big={big} />
			</div>
			<span
				className="pointer-events-auto absolute inset-y-0 grid -translate-x-1/2 cursor-ew-resize justify-center"
				style={{ left: `${split}%`, width: 24 / s }}
				onPointerDown={(e) => {
					e.stopPropagation()
					e.currentTarget.setPointerCapture(e.pointerId)
				}}
				onPointerMove={drag}
			>
				<i className="h-full bg-white/80" style={{ width: 2 / s }} />
			</span>
		</>
	)
}

// [Agent] One card full screen, zoomable. With `compare` the reference sits on top behind a wipe, and both videos
// share one clock.
function Frame({ src, compare }: { src: string; compare?: string }) {
	// [Agent] The dialog portal mounts its content a render late, so the box is kept in state, not a ref.
	const [box, setBox] = useState<HTMLDivElement | null>(null)
	const [videos, setVideos] = useState<HTMLVideoElement[]>([])
	const [view, setView] = useState(HOME)
	const refSrc = compare && (registry.get(compare)?.src || compare)
	const probe = useStore((s) => s.media[src])
	const refProbe = useStore((s) => refSrc && s.media[refSrc])

	useEffect(() => setVideos([...(box?.querySelectorAll("video") ?? [])]), [box, !!probe, !!refProbe])

	if (!probe)
		return (
			<div className="grid h-full place-items-center text-muted-foreground">⏳ not there yet · {src}</div>
		)
	return (
		<div className="flex h-full flex-col">
			<div ref={setBox} className="relative min-h-0 flex-1">
				<Zoom w={probe.w} h={probe.h} view={view} onView={setView} still={!probe.video} keys>
					{({ s, big }) => (
						<>
							<Asset src={src} probe={probe} big={big} />
							{refSrc && refProbe && <Wipe src={refSrc} probe={refProbe} s={s} big={big} />}
						</>
					)}
				</Zoom>
				{refSrc && refProbe && (
					<>
						<span className={`${label} left-2`}>Reference</span>
						<span className={`${label} right-2`}>This card</span>
					</>
				)}
			</div>
			<Controls videos={videos} />
		</div>
	)
}

export function Viewer() {
	const id = useStore((s) => s.viewing)
	const item = id ? registry.get(id) : undefined
	const probe = useStore((s) => item?.src && s.media[item.src])
	const ids = cards()
	const index = ids.indexOf(id!)
	const show = (next: string | null) => {
		flush()
		useStore.setState({ viewing: next })
	}
	const go = (step: number) => show(ids[Math.max(0, Math.min(ids.length - 1, index + step))])

	useEffect(() => {
		if (!item) return
		const onKey = (e: KeyboardEvent) => {
			if (!STEPS[e.key] || typing(e)) return
			e.preventDefault()
			go(STEPS[e.key])
		}
		addEventListener("keydown", onKey)
		return () => removeEventListener("keydown", onKey)
	}, [id])

	if (!id || !item?.src) return null
	return (
		<Dialog open onOpenChange={(open) => open || show(null)}>
			{/* [Agent] No auto-focus: a focused button or slider would swallow ←/→ and show a focus ring. */}
			<DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className={fullScreen}>
				<div className="min-h-0 flex-1 bg-black">
					<Frame key={id} src={item.src} compare={item.compare} />
				</div>
				<footer className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5 text-sm">
					<div className="flex min-w-0 basis-full flex-wrap items-center gap-1.5">
						{item.sectionTitle && <span className="text-muted-foreground">{item.sectionTitle} /</span>}
						<Badges list={item.badges} status />
						<DialogTitle className="text-sm">{item.title}</DialogTitle>
						{probe && <span className="text-muted-foreground tabular-nums">{`${probe.w}×${probe.h}`}</span>}
						{item.caption && (
							<span className="min-w-0 break-words text-muted-foreground">{item.caption}</span>
						)}
						<Badges list={item.badges} status={false} />
					</div>
					<Button aria-label="Previous" onClick={() => go(-1)}>
						←
					</Button>
					<Button aria-label="Next" onClick={() => go(1)}>
						→
					</Button>
					<Votes id={id} />
					{/* [Agent] In the button row, not after the caption: a long caption pushed the link off the screen. It
					    serves the file as it is on disk, so the download is the original at full resolution. */}
					<Button asChild>
						<a href={fileUrl(item.src)} download={item.src.split("/").pop()}>
							⬇ Download
						</a>
					</Button>
					<div className="min-w-60 flex-1 *:mt-0">
						<Note
							key={id}
							id={id}
							placeholder="Note · Ctrl/⌘+Enter saves and goes next · ←/→ move · Esc closes"
							onSubmit={() => go(1)}
						/>
					</div>
					<span className="text-muted-foreground">
						{index + 1} / {ids.length}
					</span>
					<Button onClick={() => show(null)}>Close</Button>
				</footer>
			</DialogContent>
		</Dialog>
	)
}
