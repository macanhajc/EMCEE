"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// This app has one committed dark look (see globals.css's "after-hours
// marquee" theme, "not tied to prefers-color-scheme") — no light mode, no
// next-themes, so the toaster is hardcoded dark rather than reading a
// theme that doesn't exist. Colors reference the marquee palette (panel/
// paper) instead of the neutral shadcn --popover tokens, which are only
// ever styled for the default light/dark shadcn theme, never this one.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      richColors
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--panel)",
          "--normal-text": "var(--paper)",
          "--normal-border": "rgba(248, 241, 228, 0.12)",
          "--border-radius": "0.75rem",
          "--success-bg": "rgba(16, 185, 129, 0.12)",
          "--success-text": "#6ee7b7",
          "--success-border": "rgba(16, 185, 129, 0.35)",
          "--error-bg": "rgba(239, 68, 68, 0.12)",
          "--error-text": "#fca5a5",
          "--error-border": "rgba(239, 68, 68, 0.35)",
          "--warning-bg": "rgba(247, 183, 51, 0.12)",
          "--warning-text": "#fcd34d",
          "--warning-border": "rgba(247, 183, 51, 0.35)",
          "--info-bg": "rgba(255, 92, 138, 0.12)",
          "--info-text": "#ffb3cf",
          "--info-border": "rgba(255, 92, 138, 0.35)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast font-marquee-body",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
