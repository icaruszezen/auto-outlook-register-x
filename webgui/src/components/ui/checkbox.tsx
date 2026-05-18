"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group/checkbox peer inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-background text-primary-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-primary data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        keepMounted
        className="flex items-center justify-center text-current data-unchecked:hidden"
      >
        <Check className="size-3 group-data-indeterminate/checkbox:hidden" />
        <Minus className="hidden size-3 group-data-indeterminate/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
