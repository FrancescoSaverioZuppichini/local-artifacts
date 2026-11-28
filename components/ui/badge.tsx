import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
	[
		"inline-flex w-fit max-w-full shrink items-center justify-center gap-1 overflow-hidden rounded-xl border",
		"border-transparent px-2 py-0.5 text-xs font-medium leading-snug whitespace-normal break-words [&>svg]:size-3",
	],
	{
		variants: {
			variant: {
				outline: "border-border text-muted-foreground",
				destructive: "bg-destructive text-white dark:bg-destructive/60",
				ok: "bg-green-950 text-green-300",
				bad: "bg-red-950 text-red-300",
				star: "bg-yellow-950 text-yellow-300",
				ask: "bg-amber-400 text-black",
			},
		},
		defaultVariants: { variant: "outline" },
	},
)

function Badge({
	className,
	variant = "outline",
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return (
		<span
			data-slot="badge"
			data-variant={variant}
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	)
}

export { Badge, badgeVariants }
