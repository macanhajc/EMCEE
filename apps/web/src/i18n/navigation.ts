import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware drop-ins for next/link and next/navigation — every internal
// href automatically carries the current locale's prefix.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
