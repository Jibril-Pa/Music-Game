"use client";

import dynamic from "next/dynamic";

// Phaser touches `window` on import, so the game is client-only (ssr: false),
// as in phaserjs/template-nextjs.
const GameApp = dynamic(() => import("@/components/game/GameApp"), {
  ssr: false,
  loading: () => <div className="game-loading">Opening the storybook…</div>,
});

export default function PlayClient() {
  return <GameApp />;
}
