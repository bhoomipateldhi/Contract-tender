import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-slate-200/10 bg-white/5 text-slate-50 shadow-sm backdrop-blur",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

export { Card };
