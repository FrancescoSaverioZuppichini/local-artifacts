import { type ReactNode, useContext, useRef } from "react"
import { Button } from "@/components/ui/button"
import { openSide, useVideos } from "@/shell/side-by-side"
import { SectionCtx } from "@/shell/state"
import type { MediaProps } from "@/types"
import { Media } from "./media"

type GalleryProps = { title?: string; items?: MediaProps[]; children?: ReactNode }

// [Agent] With 2+ videos it opens the side-by-side player on just its own videos; the picker there still
// offers the rest of the section. A gallery holding all of its section's videos leaves that to the section's
// button.
export function Gallery({ title, items, children }: GalleryProps) {
	const ref = useRef<HTMLElement>(null)
	const videos = useVideos(ref)
	const section = useContext(SectionCtx)
	const side = videos.length > 1 && videos.length < (section?.videos ?? Infinity)

	function compare() {
		const root = ref.current!.closest<HTMLElement>("[data-section]") ?? ref.current!
		openSide(root, section?.title ?? title ?? "", videos)
	}

	return (
		<section ref={ref} data-gallery={title ?? ""} className="not-prose mt-5">
			{(title || side) && (
				<div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
					{title && <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>}
					{side && (
						<Button size="xs" onClick={compare}>
							▶ Side by side · {videos.length}
						</Button>
					)}
				</div>
			)}
			<div className="flex flex-wrap items-stretch gap-3">
				{items?.map((item) => (
					<Media key={item.id ?? item.src} {...item} />
				))}
				{children}
			</div>
		</section>
	)
}
