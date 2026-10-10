import React, { useRef, useEffect, useMemo } from 'react';

/* ─────────────────────────────────────────────────────────
   Starfield — randomly-placed twinkle dots
   ───────────────────────────────────────────────────────── */
export function Starfield({ count = 80 }) {
  const stars = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      size: Math.random() * 2 + 0.5,
      delay: `${Math.random() * 6}s`,
      duration: `${Math.random() * 4 + 3}s`,
      opacity: Math.random() * 0.5 + 0.1,
    }));
  }, [count]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {stars.map(s => (
        <div
          key={s.id}
          className="star"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            animation: `starTwinkle ${s.duration} ease-in-out ${s.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   LiquidBlob — the centrepiece morphing water-orb
   Uses multiple layered divs with independent
   border-radius & float animations to simulate the
   organic, liquid mercury / water-droplet motion.
   ───────────────────────────────────────────────────────── */
export function LiquidBlob({ className = '' }) {
  return (
    <div
      className={`relative select-none pointer-events-none ${className}`}
      aria-hidden
    >
      {/* ── Outer ambient glow halo ── */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(ellipse, rgba(210,245,123,0.16) 0%, rgba(14,62,70,0.25) 50%, transparent 75%)',
          filter: 'blur(40px)',
          transform: 'scale(1.3)',
          animation: 'blobGlow 5s ease-in-out infinite',
        }}
      />

      {/* ── Main blob body ── */}
      <div
        className="liquid-blob relative overflow-hidden"
        style={{
          width: '100%',
          height: '100%',
          background: `
            radial-gradient(ellipse at 35% 30%, rgba(210,245,123,0.45) 0%, transparent 55%),
            radial-gradient(ellipse at 70% 70%, rgba(14,62,70,0.75) 0%, transparent 55%),
            radial-gradient(ellipse at 20% 75%, rgba(56,189,248,0.35) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 25%, rgba(110,231,183,0.40) 0%, transparent 45%),
            linear-gradient(135deg, rgba(6,35,39,0.95) 0%, rgba(4,24,27,0.98) 100%)
          `,
          boxShadow: `
            inset 0 2px 40px rgba(210,245,123,0.22),
            inset 0 -2px 30px rgba(4,24,27,0.60),
            0 0 80px rgba(210,245,123,0.12),
            0 0 40px rgba(14,62,70,0.25)
          `,
        }}
      >
        {/* ── Specular highlight (top-left shimmer) ── */}
        <div
          style={{
            position: 'absolute',
            top: '8%',
            left: '12%',
            width: '45%',
            height: '35%',
            background: `
              radial-gradient(ellipse at 40% 40%, rgba(240,255,200,0.50) 0%, rgba(210,245,123,0.18) 50%, transparent 75%)
            `,
            borderRadius: '50% 70% 60% 50%',
            filter: 'blur(6px)',
            animation: 'specularSweep 14s linear infinite',
          }}
        />

        {/* ── Secondary specular (right edge ring reflection) ── */}
        <div
          style={{
            position: 'absolute',
            bottom: '10%',
            right: '8%',
            width: '55%',
            height: '30%',
            background: `
              radial-gradient(ellipse, rgba(110,231,183,0.25) 0%, transparent 70%)
            `,
            borderRadius: '60% 40% 50% 60%',
            filter: 'blur(12px)',
            animation: 'specularSweep 18s linear infinite reverse',
          }}
        />

        {/* ── Lime rim ring ── */}
        <div
          style={{
            position: 'absolute',
            bottom: '-8%',
            left: '10%',
            right: '10%',
            height: '40%',
            background: `
              radial-gradient(ellipse at 50% 80%, rgba(210,245,123,0.60) 0%, rgba(14,62,70,0.40) 30%, transparent 65%)
            `,
            filter: 'blur(8px)',
            borderRadius: '50%',
          }}
        />

        {/* ── Inner blob (second liquid layer for depth) ── */}
        <div
          className="liquid-blob-inner"
          style={{
            position: 'absolute',
            top: '15%',
            left: '18%',
            width: '65%',
            height: '60%',
            background: `
              radial-gradient(ellipse at 50% 40%, rgba(210,245,123,0.18) 0%, transparent 60%),
              radial-gradient(ellipse at 30% 70%, rgba(14,62,70,0.25) 0%, transparent 60%)
            `,
            filter: 'blur(4px)',
            opacity: 0.7,
          }}
        />
      </div>
    </div>
  );
}
