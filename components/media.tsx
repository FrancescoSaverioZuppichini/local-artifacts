import { type CSSProperties, useContext } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Comment } from "@/shell/comment"
import { picks, registry, SectionCtx, thumbUrl, useReview, useStore } from "@/shell/state"
import { Votes } from "@/shell/votes"
import { type MediaProps, playable } from "@/types"
import { Badges, tone } from "./badge"

// [Agent] Fixed height from the S/M/L setting, width from the probed aspect ratio, so nothing moves when
// thumbnails land. ?pick= and #card links ring the card through data-picked.
const card = cn(
	"not-prose cursor-zoom-in gap-0 overflow-hidden rounded-lg py-0 shadow-none hover:border-foreground/30",
	"w-[max(11rem,min(100%,calc(var(--card-h)*var(--ar,0.75))))]",
	"data-picked:outline-3 data-picked:outline-offset-2 data-picked:outline-amber-400",
)
const onThumb = "border-0 bg-black/70 text-foreground whitespace-nowrap shrink-0"

// [Agent] A poster-only card: the grid never loads a video, it plays in the viewer. A file that is not there
// yet is a ⏳ card that fills in by itself.
export function Media(props: MediaProps) {
	const { src, title, caption, badges, compare } = props
	const id = props.id ?? src
	const section = useContext(SectionCtx)
	const probe = useStore((s) => s.media[src])
	const note = useReview(id)?.note?.trim()
	registry.set(id, { ...props, id, kind: "media", section: section?.id, sectionTitle: section?.title })

	return (
		<Card
			id={id}
			data-card={id}
			data-video={probe?.video || undefined}
			data-picked={picks.has(id) || undefined}
			style={{ "--ar": probe?.w ? probe.w / probe.h : undefined } as CSSProperties}
			onClick={() => useStore.setState({ viewing: id })}
			className={card}
		>
			<div className="relative grid h-(--card-h) place-items-center bg-black">
				{probe ? (
					<img
						src={thumbUrl(src, probe)}
						loading="lazy"
						decoding="async"
						alt=""
						className="absolute inset-0 size-full object-contain"
					/>
				) : (
					<span className="px-3 text-center text-sm text-muted-foreground">
						⏳ not there yet
						<br />
						<span className="text-[11px] break-all">{src}</span>
					</span>
				)}
				<div className="absolute top-1.5 right-1.5 left-1.5 flex flex-wrap gap-1">
					{probe?.video && (
						<Badge className={onThumb}>▶ {probe.dur ? `${probe.dur.toFixed(1)} s` : ""}</Badge>
					)}
					{probe?.w ? <Badge className={onThumb}>{`${probe.w}×${probe.h}`}</Badge> : null}
					{compare && (
						<Badge className={onThumb} title={`compare: ${compare}`}>
							⇆
						</Badge>
					)}
					{!playable(probe?.codec) && (
						<Badge variant="destructive" title="Chrome cannot play this codec; re-encode to H.264">
							⚠ {probe?.codec}
						</Badge>
					)}
				</div>
			</div>
			<div className="flex flex-1 flex-col gap-1 p-2 text-[13px] leading-snug">
				<div className="flex flex-wrap items-baseline gap-1">
					<Badges list={badges} status />
					<b className="line-clamp-2 font-medium" title={title}>
						{title ?? src.split("/").pop()}
					</b>
				</div>
				{caption && (
					<div className="line-clamp-2 text-muted-foreground" title={caption}>
						{caption}
					</div>
				)}
				{badges?.some((text) => !tone(text)) && (
					<div className="flex min-w-0 flex-wrap gap-1">
						<Badges list={badges} status={false} />
					</div>
				)}
				<div className="mt-auto flex min-w-0 items-center gap-1 pt-1">
					<Votes id={id} />
					{note && <Comment text={note} line className="min-w-0 flex-1 text-xs" />}
				</div>
			</div>
		</Card>
	)
}
