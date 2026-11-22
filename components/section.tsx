import { ChevronRight } from "lucide-react"
import { type ReactNode, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Comment } from "@/shell/comment"
import { openSide, useVideos } from "@/shell/side-by-side"
import { countNotes, registry, SectionCtx, setOpen, useReview, useStore } from "@/shell/state"
import type { SectionProps } from "@/types"
import { Badges } from "./badge"
import { components } from "./index"
import { Note } from "./note"

// [Agent] A foldable chapter. Folded content stays mounted (only hidden), so the contents, the viewer, ←/→
// and comment anchoring see every card.
export function Section({
	id,
	title,
	date,
	badges,
	open,
	blocks,
	children,
}: SectionProps & { children?: ReactNode }) {
	const isOpen = useStore((s) => !!s.open[id])
	const notes = useStore((s) => countNotes(s.feedback, id))
	const note = useReview(id)?.note?.trim()
	const ref = useRef<HTMLElement>(null)
	const videos = useVideos(ref)
	registry.set(id, { id, kind: "section", title, date, badges, open })

	// [Agent] The note under the title is a preview; a click opens the section and focuses its note box.
	function editNote(e: React.MouseEvent) {
		e.stopPropagation()
		setOpen([id], true)
		requestAnimationFrame(() => {
			const box = ref.current!.querySelector<HTMLElement>(`[data-note="${CSS.escape(id)}"]`)
			box?.scrollIntoView({ block: "center" })
			box?.focus()
		})
	}

	return (
		<SectionCtx.Provider value={{ id, title, videos: videos.length }}>
			<section ref={ref} id={id} data-section="" className="scroll-mt-6 border-b py-3">
				{/* [Agent] The whole header folds on click; the chevron is the keyboard-reachable toggle. */}
				<div
					className="not-prose flex cursor-pointer gap-2 rounded-md p-1 hover:bg-muted/50"
					onClick={() => setOpen([id], !isOpen)}
				>
					<Button
						variant="ghost"
						size="icon-xs"
						aria-expanded={isOpen}
						aria-label={isOpen ? "Fold" : "Unfold"}
					>
						<ChevronRight
							className={`text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
						/>
					</Button>
					<div className="min-w-0 flex-1">
						{date && <div className="text-xs text-muted-foreground">{date}</div>}
						<div className="flex flex-wrap items-center gap-1.5">
							<h2 className="text-lg font-semibold tracking-tight text-balance">{title}</h2>
							<Badges list={badges} status />
						</div>
						<div className="mt-1 flex flex-wrap items-center gap-1 empty:hidden">
							<Badges list={badges} status={false} />
							{videos.length > 1 && (
								<Button
									size="xs"
									onClick={(e) => {
										e.stopPropagation()
										openSide(ref.current!, title)
									}}
								>
									▶ Side by side · {videos.length} videos
								</Button>
							)}
							{notes > 0 && <Badge>💬 {notes}</Badge>}
						</div>
						{note && <Comment text={note} line={!isOpen} className="mt-2 cursor-text" onClick={editNote} />}
					</div>
				</div>
				<div hidden={!isOpen} className="pl-8">
					{blocks?.map(({ type, ...props }, i) => {
						const Block = components[type as keyof typeof components] as React.ComponentType<object>
						if (Block) return <Block key={i} {...props} />
						return (
							<p key={i} className="text-red-300">
								Unknown block type “{type}”: register it in components/index.ts
							</p>
						)
					})}
					{children}
					<div data-comments={id} />
					<Note id={id} placeholder="Note on this section…" />
				</div>
			</section>
		</SectionCtx.Provider>
	)
}
