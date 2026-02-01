import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-10 w-full rounded-lg border border-slate-200/15 bg-white/5 px-3 text-sm text-slate-100 outline-none ring-offset-2 transition placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-slate-200/50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
