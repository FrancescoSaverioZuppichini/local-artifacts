import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { typing } from "./state"

const KEYS: Record<string, number> = { "+": 1.25, "=": 1.25, "-": 0.8 }
const MAX = 8

// [Agent] What the reader looks at, whatever the stage's size: `zoom` times fit (0 = the opening view) and the
// content point (0–1) at the stage's centre. Side by side gives every column the same one, so they zoom as one.
export type View = { zoom: number; cx: number; cy: number }
export const HOME: View = { zoom: 0, cx: 0.5, cy: 0.5 }

// [Agent] `s` is CSS px per content px; x, y put the content's top-left corner in the cw × ch stage.
type Place = { s: number; x: number; y: number; fit: number }

// [Agent] Fit keeps an 8 px margin; zoomed, the content uses the whole stage. A still strip over 3:1 (a phone
// screenshot) opens at its full width (or height), at most 100 %, from the top (or left); a wide video (side by
// side clips) opens whole, since it is watched, not read. An axis shorter than the stage is centred, a longer one
// never shows a gap.
function place(view: View, w: number, h: number, cw: number, ch: number, still: boolean): Place {
	const fit = Math.min((cw - 16) / w, (ch - 16) / h)
	const [tall, wide] = [still && h > 3 * w, still && w > 3 * h]
	const strip = tall ? Math.min(cw / w, 1) : wide ? Math.min(ch / h, 1) : fit
	const s = view.zoom ? Math.min(MAX, Math.max(fit, fit * view.zoom)) : Math.max(fit, strip)
	const [cx, cy] = view.zoom ? [view.cx, view.cy] : [wide ? 0 : 0.5, tall ? 0 : 0.5]
	const axis = (c: number, size: number, room: number) =>
		size <= room ? (room - size) / 2 : Math.min(0, Math.max(room - size, room / 2 - c * size))
	return { s, fit, x: axis(cx, w * s, cw), y: axis(cy, h * s, ch) }
}

// [Agent] The view for a corner (x, y) at scale s, run back through `place` so a pan never stores a spot past
// the edge.
function settle(
	s: number,
	x: number,
	y: number,
	w: number,
	h: number,
	cw: number,
	ch: number,
	still: boolean,
): View {
	const fit = Math.min((cw - 16) / w, (ch - 16) / h)
	const view = (s: number, x: number, y: number) => ({
		zoom: s / fit,
		cx: (cw / 2 - x) / (w * s),
		cy: (ch / 2 - y) / (h * s),
	})
	const p = place(view(s, x, y), w, h, cw, ch, still)
	return view(p.s, p.x, p.y)
}

// [Agent] A stage that zooms and pans its content (a still, a video, a compare pair): Ctrl/⌘ + wheel or pinch
// at the cursor, wheel or drag to pan, double-click for fit ↔ 100 %, and with `keys` + / - / 0 / Esc. While the
// content overflows, a minimap shows where you are; it copies the content's first image or the live video frame.
export function Zoom({
	w,
	h,
	view,
	onView,
	still = false,
	keys,
	children,
}: {
	w: number
	h: number
	view: View
	onView: (view: View) => void
	still?: boolean
	keys?: boolean
	children: (zoom: { s: number; big: boolean }) => ReactNode
}) {
	const [stage, setStage] = useState<HTMLDivElement | null>(null)
	const [{ cw, ch }, setSize] = useState({ cw: 0, ch: 0 })
	const content = useRef<HTMLDivElement>(null)
	const mini = useRef<HTMLCanvasElement>(null)
	const last = useRef<{ x: number; y: number }>(undefined)
	const p = place(view, w, h, cw, ch, still)
	const big = w * p.s > cw + 1 || h * p.s > ch + 1
	const move = (s: number, x: number, y: number) => onView(settle(s, x, y, w, h, cw, ch, still))
	// [Agent] The content point under (px, py) stays under it.
	const zoomAt = (target: number, px: number, py: number) => {
		const s = Math.max(p.fit, Math.min(target, MAX))
		move(s, px - ((px - p.x) * s) / p.s, py - ((py - p.y) * s) / p.s)
	}
	// [Agent] Minimap: short side at most 120 px; a strip may run along 80 % of the stage, like a scrollbar.
	const m = Math.min(120 / Math.min(w, h), (0.8 * (w > h ? cw : ch)) / Math.max(w, h))

	useEffect(() => {
		if (!stage) return
		const ro = new ResizeObserver(() => setSize({ cw: stage.clientWidth, ch: stage.clientHeight }))
		ro.observe(stage)
		return () => ro.disconnect()
	}, [stage])

	// [Agent] A trackpad pinch arrives as a Ctrl + wheel. Not passive, or the browser zooms the page as well.
	useEffect(() => {
		if (!stage) return
		const onWheel = (e: WheelEvent) => {
			e.preventDefault()
			const r = stage.getBoundingClientRect()
			const k = Math.exp(-Math.max(-25, Math.min(25, e.deltaY)) / 100)
			if (e.ctrlKey || e.metaKey) zoomAt(p.s * k, e.clientX - r.left, e.clientY - r.top)
			else move(p.s, p.x - e.deltaX, p.y - e.deltaY)
		}
		stage.addEventListener("wheel", onWheel, { passive: false })
		return () => stage.removeEventListener("wheel", onWheel)
	})

	// [Agent] Window capture runs before the dialog's Esc listener (document capture), and a prevented Esc does not
	// close it: the first Esc only undoes the zoom.
	useEffect(() => {
		if (!keys) return
		const onKey = (e: KeyboardEvent) => {
			if (typing(e) || e.metaKey || e.ctrlKey) return
			if (KEYS[e.key]) zoomAt(p.s * KEYS[e.key], cw / 2, ch / 2)
			else if (e.key === "0" || (e.key === "Escape" && view.zoom)) onView(HOME)
			else return
			e.preventDefault()
		}
		addEventListener("keydown", onKey, true)
		return () => removeEventListener("keydown", onKey, true)
	})

	// [Agent] A video's minimap is redrawn every frame so it plays along; a still is drawn once it has loaded.
	useEffect(() => {
		const el = content.current?.querySelector<HTMLImageElement | HTMLVideoElement>("video, img")
		const ctx = mini.current?.getContext("2d")
		if (!big || !el || !ctx) return
		const draw = () => {
			if (el instanceof HTMLVideoElement ? el.readyState >= 2 : el.complete && el.naturalWidth)
				ctx.drawImage(el, 0, 0, ctx.canvas.width, ctx.canvas.height)
		}
		if (el instanceof HTMLImageElement) {
			draw()
			el.addEventListener("load", draw)
			return () => el.removeEventListener("load", draw)
		}
		let frame = 0
		const loop = () => {
			draw()
			frame = requestAnimationFrame(loop)
		}
		loop()
		return () => cancelAnimationFrame(frame)
	}, [big, w, h])

	const jump = (e: PointerEvent<HTMLElement>) => {
		const r = e.currentTarget.getBoundingClientRect()
		const [ix, iy] = [(e.clientX - r.left) / m, (e.clientY - r.top) / m]
		move(p.s, cw / 2 - ix * p.s, ch / 2 - iy * p.s)
	}

	return (
		<div
			ref={setStage}
			className={`relative size-full touch-none overflow-hidden select-none ${big ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId)
				last.current = { x: e.clientX, y: e.clientY }
			}}
			onPointerMove={(e) => {
				if (!last.current) return
				const [dx, dy] = [e.clientX - last.current.x, e.clientY - last.current.y]
				last.current = { x: e.clientX, y: e.clientY }
				move(p.s, p.x + dx, p.y + dy)
			}}
			onLostPointerCapture={() => (last.current = undefined)}
			onDoubleClick={(e) => {
				const r = e.currentTarget.getBoundingClientRect()
				zoomAt(p.s < 1 ? 1 : p.fit, e.clientX - r.left, e.clientY - r.top)
			}}
		>
			{/* [Agent] Mounted from the start, so the owner finds its videos at once; hidden until the stage is measured. */}
			<div
				ref={content}
				className={`pointer-events-none absolute top-0 left-0 origin-top-left ${cw ? "" : "invisible"}`}
				style={{ width: w, height: h, transform: `translate(${p.x}px, ${p.y}px) scale(${Math.max(p.s, 0)})` }}
			>
				{children({ s: p.s, big })}
			</div>
			<div className="absolute right-3 bottom-3 flex items-end gap-1.5">
				<span className="rounded bg-black/70 px-1.5 text-[11px] font-semibold tabular-nums">
					{Math.round(p.s * 100)} %
				</span>
				{big && (
					<div
						className="relative cursor-pointer overflow-hidden outline outline-white/50"
						style={{ width: w * m, height: h * m }}
						onPointerDown={(e) => {
							e.stopPropagation()
							e.currentTarget.setPointerCapture(e.pointerId)
							jump(e)
						}}
						onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && jump(e)}
					>
						<canvas
							ref={mini}
							width={Math.round(w * m * devicePixelRatio)}
							height={Math.round(h * m * devicePixelRatio)}
							className="pointer-events-none size-full bg-black"
						/>
						<i
							className="absolute border border-white shadow-[0_0_0_999px_rgb(0_0_0/0.5)]"
							style={{
								left: (Math.max(0, -p.x) / p.s) * m,
								top: (Math.max(0, -p.y) / p.s) * m,
								width: Math.min(w, cw / p.s) * m,
								height: Math.min(h, ch / p.s) * m,
							}}
						/>
					</div>
				)}
			</div>
		</div>
	)
}
