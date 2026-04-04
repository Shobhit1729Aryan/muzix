"use client";
import { Appbar } from "./components/Appbar";
import { Redirect } from "./components/Redirect";
import { signIn } from "next-auth/react";

export default function Home() {
  return (
    <main className="bg-[#080b12] text-[#e8eaf0] font-mono overflow-x-hidden">
      <Appbar />
      <Redirect />
      {/* HERO */}
      <section className="min-h-screen flex flex-col items-center justify-center relative px-6 md:px-12 pt-32 pb-20 text-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(91,110,245,0.12)_0%,transparent_60%)]" />
        <div className="absolute inset-0 pointer-events-none [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />

        <div className="inline-flex items-center gap-2 border border-[rgba(125,249,194,0.3)] bg-[rgba(125,249,194,0.05)] text-[#7DF9C2] px-4 py-1 rounded-full text-xs tracking-widest uppercase mb-8">
          <span className="w-1.5 h-1.5 bg-[#7DF9C2] rounded-full animate-pulse" />
          Live now — 2,400+ active streams
        </div>

        <h1 className="font-extrabold text-[clamp(3rem,7vw,6.5rem)] leading-[0.95] tracking-[-0.03em] mb-6 font-[Syne]">
          Your crowd<br />
          <em className="font-[Playfair_Display] italic text-[#7DF9C2] block">
            runs the playlist
          </em>
        </h1>

        <p className="max-w-xl text-[#5a6480] text-sm leading-8 mb-12">
          The first music platform where your fans vote on every song. Drop a
          link, go live, and let your community shape the vibe — in real time.
        </p>

        <div className="flex gap-4 flex-wrap justify-center relative z-10">
          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="bg-[#7DF9C2] text-black px-8 py-3 text-xs tracking-wider uppercase shadow-[0_0_30px_rgba(125,249,194,0.2)] hover:translate-y-[-2px] transition cursor-pointer"
          >
            Start for free
          </button>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-32 px-6 md:px-12">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-12">
            Three steps to a <span className="text-[#7DF9C2] italic">crowd-controlled</span> stream
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-[#0d1220] border border-white/5 p-8">
              <h3 className="text-xl font-semibold mb-4">🎙️ Connect your stream</h3>
              <p className="text-[#5a6480] text-sm">
                Link your YouTube or any stream source. No plugins required.
              </p>
            </div>

            <div className="bg-[#0d1220] border border-white/5 p-8">
              <h3 className="text-xl font-semibold mb-4">🗳️ Fans drop requests</h3>
              <p className="text-[#5a6480] text-sm">
                Viewers submit songs and vote in real time.
              </p>
            </div>

            <div className="bg-[#0d1220] border border-white/5 p-8">
              <h3 className="text-xl font-semibold mb-4">🎧 Music flows</h3>
              <p className="text-[#5a6480] text-sm">
                Top voted track automatically plays next in queue.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-32 px-6 md:px-12 bg-[#0d1220]">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-16">
            Built for creators. <span className="text-[#7DF9C2] italic">Loved by fans.</span>
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-8 border border-white/5">
              <h3 className="text-lg font-semibold mb-3">⚡ Real-time voting</h3>
              <p className="text-[#5a6480] text-sm">
                Queue updates instantly using WebSockets.
              </p>
            </div>

            <div className="p-8 border border-white/5">
              <h3 className="text-lg font-semibold mb-3">🎛️ Creator controls</h3>
              <p className="text-[#5a6480] text-sm">
                Filter songs, moderate queue and stay in control.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-32 px-6 md:px-12 text-center">
        <h2 className="text-4xl font-bold mb-16">
          Simple, <span className="text-[#7DF9C2] italic">transparent</span> plans
        </h2>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="border border-white/5 p-8">
            <h3 className="mb-4 font-semibold">Starter</h3>
            <p className="text-3xl font-bold">$0</p>
            <p className="text-[#5a6480] text-sm mt-2">Forever free</p>
          </div>

          <div className="border border-[#7DF9C2]/40 p-8 bg-[#7DF9C2]/5">
            <h3 className="mb-4 font-semibold">Creator</h3>
            <p className="text-3xl font-bold">$18</p>
            <p className="text-[#5a6480] text-sm mt-2">Per month</p>
          </div>

          <div className="border border-white/5 p-8">
            <h3 className="mb-4 font-semibold">Studio</h3>
            <p className="text-3xl font-bold">$79</p>
            <p className="text-[#5a6480] text-sm mt-2">Per month</p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-12 text-center text-[#5a6480] text-sm">
        © 2026 WaveCrowd. All rights reserved.
      </footer>
    </main>
  );
}