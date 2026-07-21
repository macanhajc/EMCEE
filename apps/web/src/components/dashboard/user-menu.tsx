"use client";

import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  Monitor,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { openBillingPortal } from "@/app/checkout/actions";
import { signOutEverywhere, signOutHere } from "@/app/dashboard/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname } from "next/navigation";

const menuItemClass =
  "text-paper cursor-pointer focus:bg-paper/10 focus:text-marquee";

const menuActiveClass = "bg-white text-black";

export function UserMenu({
  email,
  role,
  hasBilling,
}: {
  email: string;
  role: "customer" | "admin";
  hasBilling: boolean;
}) {
  const location = usePathname();
  const initial = email.charAt(0).toUpperCase() || "?";

  const paths = [
    {
      icon: <LayoutDashboard className="text-dust" />,
      name: "Dashboard",
      route: "/dashboard",
    },
    {
      icon: <UserRound className="text-dust" />,
      name: "Profile",
      route: "/account",
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full cursor-pointer outline-none ring-2 ring-spotlight/50">
        <Avatar className="border border-paper/15">
          <AvatarFallback className="bg-panel-2 font-ui-mono text-xs text-paper">
            {initial}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-64 border border-paper/10 bg-panel"
      >
        <DropdownMenuLabel className="font-normal">
          <p className="truncate font-marquee-body text-sm text-paper">
            {email}
          </p>
          <p className="font-ui-mono text-[11px] text-dust uppercase">{role}</p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-paper/10" />

        {paths.map((item, index) => (
          <DropdownMenuItem
            key={index}
            asChild
            className={
              item.route === location ? menuActiveClass : menuItemClass
            }
          >
            <Link href={item.route}>
              {item.icon}
              {item.name}
            </Link>
          </DropdownMenuItem>
        ))}

        {role === "admin" && (
          <DropdownMenuItem asChild className={menuItemClass}>
            <Link href="/admin">
              <ShieldCheck className="text-dust" />
              Admin
            </Link>
          </DropdownMenuItem>
        )}

        {hasBilling && (
          <form action={openBillingPortal}>
            <DropdownMenuItem asChild className={menuItemClass}>
              <button type="submit" className="w-full">
                <CreditCard className="text-dust" />
                Manage billing
              </button>
            </DropdownMenuItem>
          </form>
        )}

        <DropdownMenuSeparator className="bg-paper/10" />

        <form action={signOutHere}>
          <DropdownMenuItem asChild className={menuItemClass}>
            <button type="submit" className="w-full">
              <LogOut className="text-dust" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>

        <form action={signOutEverywhere}>
          <DropdownMenuItem asChild className={menuItemClass}>
            <button type="submit" className="w-full">
              <Monitor className="text-dust" />
              Sign out everywhere
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
