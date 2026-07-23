/**
 * HTML + plain-text rendering for email components. Uses @react-email/render
 * directly rather than the @react-email/components package — the latter
 * (and its whole family of primitive packages: @react-email/button,
 * /container, /text, etc.) is deprecated on npm as of this writing, with no
 * replacement announced. @react-email/render is unaffected (independently
 * maintained, still actively released) and is already a dependency of
 * `resend` itself, so components/layout.tsx builds the actual markup by
 * hand with plain, email-safe HTML instead.
 */
import "server-only";
import { render } from "@react-email/render";
import type { ReactElement } from "react";

export async function renderEmail(node: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(node), render(node, { plainText: true })]);
  return { html, text };
}
