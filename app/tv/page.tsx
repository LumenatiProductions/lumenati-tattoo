"use client";

import { ShopTv } from "@/components/kiosk/ShopTv";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// Watch TV: the front desk's cable set, for anyone on the site. No check-in,
// no bookings, just the channels, the guide, and the ARCADE button. The way
// back out is the EXIT button on the remote.
export default function TvPage() {
  return (
    <ShopTv
      extra={
        <a
          href="/"
          className="f-pixel w-full rounded-lg border-2 border-white/50 bg-black/70 px-2 py-3 text-center text-[10px] text-white/90 hover:text-white sm:w-auto sm:px-4 sm:py-3.5 sm:text-sm"
        >
          EXIT
        </a>
      }
    >
      <div className="pointer-events-none absolute z-10 flex items-center gap-3 rounded-xl bg-black/50 px-3 py-2 backdrop-blur-[2px]" style={{ left: "50%", top: 12, transform: "translateX(-50%)" }}>
        <LumenatiLogo bg="dark" className="eye-glow w-10" />
        <div className="text-left">
          <div className="f-pixel text-[10px] text-pink-300">LUMENATI CABLE</div>
          <div className="f-vt text-lg text-white/80">the shop tv // denver</div>
        </div>
      </div>
    </ShopTv>
  );
}
