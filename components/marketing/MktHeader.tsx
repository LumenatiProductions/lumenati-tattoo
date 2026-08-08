"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// Fixed marketing header that gets out of the way: past the hero it slides up
// and hands the page to the content; scroll back to the top and it returns.
export function MktHeader() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const onScroll = () => setHidden(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={`mkt-header ${hidden ? "is-hidden" : ""}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 pt-6">
        <LumenatiLogo bg="dark" className="w-24" />
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/admin/login" className="font-semibold text-zinc-300 hover:text-white">
            Sign in
          </Link>
          <Link href="/start" className="rounded-xl bg-brand px-4 py-2 font-bold text-white hover:brightness-110">
            Set up your shop
          </Link>
        </nav>
      </div>
    </header>
  );
}
