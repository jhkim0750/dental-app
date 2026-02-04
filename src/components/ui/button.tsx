import * as React from "react"
import { cn } from "@/lib/utils"

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link", size?: "default" | "sm" | "lg" | "icon" }>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variant === "default" && "bg-slate-900 text-slate-50 hover:bg-slate-900/90",
          variant === "destructive" && "bg-red-500 text-slate-50 hover:bg-red-500/90",
          variant === "outline" && "border border-slate-200 bg-white hover:bg-slate-100 hover:text-slate-900",
          variant === "secondary" && "bg-slate-100 text-slate-900 hover:bg-slate-100/80",
          variant === "ghost" && "hover:bg-slate-100 hover:text-slate-900",
          variant === "link" && "text-slate-900 underline-offset-4 hover:underline",
          size === "default" && "h-10 px-4 py-2",
          size === "sm" && "h-9 rounded-md px-3",
          size === "lg" && "h-11 rounded-md px-8",
          size === "icon" && "h-10 w-10",
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }