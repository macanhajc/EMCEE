/**
 * Shared chrome for every transactional email. Colors are hardcoded hex,
 * not the app's CSS custom properties (email clients don't reliably support
 * `var()`) — copied from globals.css's "after-hours marquee" marketing
 * palette, the closest thing this app has to a brand identity distinct
 * from the dashboard's neutral shadcn theme.
 */
import "server-only";
import type { ReactNode } from "react";

export const BRAND = {
  ink: "#1a0f22",
  panel: "#241536",
  marquee: "#f7b733",
  spotlight: "#ff5c8a",
  paper: "#f8f1e4",
  dust: "#b6a6c2",
} as const;

const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

interface EmailLayoutProps {
  preview: string;
  footer: string;
  children: ReactNode;
}

export function EmailLayout({ preview, footer, children }: EmailLayoutProps) {
  return (
    <html>
      {/* eslint-disable-next-line @next/next/no-head-element -- this renders to a standalone
          email document via @react-email/render, not a Next.js page; next/head doesn't apply. */}
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: "#f4f4f5", fontFamily: FONT_STACK }}>
        {/* Hidden preheader: sets the inbox preview snippet without showing in the body. */}
        <span style={{ display: "none", overflow: "hidden", lineHeight: "1px", opacity: 0, maxHeight: 0, maxWidth: 0 }}>
          {preview}
        </span>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: "#f4f4f5" }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "32px 16px" }}>
                <table
                  role="presentation"
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  style={{ maxWidth: 480, backgroundColor: BRAND.paper, borderRadius: 12, overflow: "hidden" }}
                >
                  <tbody>
                    <tr>
                      <td style={{ backgroundColor: BRAND.panel, padding: "20px 32px" }}>
                        <span style={{ color: BRAND.marquee, fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>
                          BotMarket
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "32px", color: BRAND.ink, fontSize: 15, lineHeight: "22px" }}>{children}</td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          padding: "20px 32px",
                          borderTop: "1px solid rgba(26,15,34,0.1)",
                          color: BRAND.dust,
                          fontSize: 12,
                          lineHeight: "18px",
                        }}
                      >
                        {footer}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      style={{
        display: "inline-block",
        backgroundColor: BRAND.marquee,
        color: BRAND.ink,
        fontWeight: 700,
        fontSize: 14,
        padding: "12px 24px",
        borderRadius: 8,
        textDecoration: "none",
        marginTop: 8,
      }}
    >
      {children}
    </a>
  );
}

export function EmailLinkFallback({ url }: { url: string }) {
  return (
    <p style={{ fontSize: 12, color: BRAND.dust, wordBreak: "break-all", marginTop: 20 }}>
      <a href={url} style={{ color: BRAND.dust }}>
        {url}
      </a>
    </p>
  );
}
