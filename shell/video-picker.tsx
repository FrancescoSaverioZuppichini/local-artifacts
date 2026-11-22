import { ChevronDown } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { type Group, registry } from "./state"

export const MAX = 8

export const name = (id: string) => {
	const item = registry.get(id)
	return item?.title ?? item?.src?.split("/").pop() ?? id
}
const box = "size-3.5 shrink-0 cursor-pointer accent-primary disabled:cursor-default"
const row = [
	"flex cursor-pointer items-center gap-2 rounded py-0.5 pl-5 text-[13px] hover:bg-accent",
	"has-disabled:cursor-default has-disabled:text-muted-foreground",
].join(" ")

// [Agent] Which videos are columns, gallery by gallery. A gallery's box adds or drops all of it, "Only" shows
// just that gallery. At MAX columns the unticked boxes are disabled, and the last column cannot be unticked.
export function VideoPicker({
	groups,
	shown,
	onChange,
}: {
	groups: Group[]
	shown: string[]
	onChange: (ids: string[]) => void
}) {
	const [query, setQuery] = useState("")
	const total = groups.reduce((n, g) => n + g.ids.length, 0)
	const full = shown.length >= MAX
	const match = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase())
	const add = (ids: string[]) =>
		onChange([...shown, ...ids.filter((id) => !shown.includes(id))].slice(0, MAX))
	const drop = (ids: string[]) => {
		const rest = shown.filter((id) => !ids.includes(id))
		if (rest.length) onChange(rest)
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button>
					Videos
					<span className="text-muted-foreground tabular-nums">
						{shown.length} of {total}
					</span>
					<ChevronDown />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="flex max-h-[70dvh] w-[min(28rem,calc(100vw-2rem))] flex-col p-0"
			>
				<div className="flex flex-col gap-1.5 border-b p-2">
					{total > MAX && (
						<Input
							autoFocus
							placeholder={`Filter ${total} videos by name or gallery`}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					)}
					<p className="px-0.5 text-xs text-muted-foreground">
						{full ? `${MAX} columns at most: untick one to add another.` : `Up to ${MAX} columns.`}
					</p>
				</div>
				<div className="overflow-y-auto px-2 pb-2">
					{groups.map((group, i) => {
						const ids = match(group.title) ? group.ids : group.ids.filter((id) => match(name(id)))
						const on = group.ids.filter((id) => shown.includes(id)).length
						const all = on === group.ids.length
						if (!ids.length) return null
						return (
							<div key={i}>
								<div className="sticky top-0 flex items-center gap-2 bg-popover pt-2 pb-1 text-xs font-medium">
									<label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											className={box}
											checked={all}
											disabled={!all && full}
											ref={(el) => {
												if (el) el.indeterminate = on > 0 && !all
											}}
											onChange={() => (all ? drop(group.ids) : add(group.ids))}
										/>
										<span className="truncate" title={group.title}>
											{group.title}
										</span>
									</label>
									<span className="text-muted-foreground tabular-nums">
										{on}/{group.ids.length}
									</span>
									<Button size="xs" variant="ghost" onClick={() => onChange(group.ids.slice(0, MAX))}>
										Only
									</Button>
								</div>
								{ids.map((id) => (
									<label key={id} className={row}>
										<input
											type="checkbox"
											className={box}
											checked={shown.includes(id)}
											disabled={full && !shown.includes(id)}
											onChange={() => (shown.includes(id) ? drop([id]) : add([id]))}
										/>
										<span className="truncate" title={name(id)}>
											{name(id)}
										</span>
									</label>
								))}
							</div>
						)
					})}
				</div>
			</PopoverContent>
		</Popover>
	)
}
