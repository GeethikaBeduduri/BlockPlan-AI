import { motion, useReducedMotion } from 'framer-motion';

export interface FloatingShapesProps {
  className?: string;
  intensity?: 'subtle' | 'medium' | 'high';
}

export default function FloatingShapes({ className = '', intensity = 'medium' }: FloatingShapesProps) {
  const shouldReduceMotion = useReducedMotion();
  const opacityMult = intensity === 'subtle' ? 0.35 : intensity === 'medium' ? 0.55 : 0.8;

  if (shouldReduceMotion) {
    return null;
  }

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}>
      {/* 1. Geometric Faceted Octahedron / Diamond (Railway Amber / Orange) */}
      <motion.div
        className="absolute top-[12%] right-[15%] w-48 h-48 sm:w-64 sm:h-64"
        style={{ opacity: opacityMult }}
        initial={{ y: 0, rotate: 0, scale: 0.95 }}
        animate={{
          y: [-12, 14, -12],
          rotate: [0, 8, -6, 0],
          scale: [0.95, 1.02, 0.95],
        }}
        transition={{
          duration: 14,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <svg viewBox="0 0 200 200" className="w-full h-full filter drop-shadow-[0_0_20px_rgba(245,158,11,0.25)]">
          <defs>
            <linearGradient id="amberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="amberGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0.03" />
            </linearGradient>
          </defs>
          {/* Facets */}
          <polygon points="100,20 160,80 100,120 40,80" fill="url(#amberGrad)" stroke="#f59e0b" strokeWidth="1.2" strokeOpacity="0.7" />
          <polygon points="100,120 160,80 140,170 100,180" fill="url(#amberGrad2)" stroke="#f97316" strokeWidth="1.2" strokeOpacity="0.6" />
          <polygon points="100,120 40,80 60,170 100,180" fill="url(#amberGrad)" stroke="#f59e0b" strokeWidth="1.2" strokeOpacity="0.6" />
          <line x1="100" y1="20" x2="100" y2="180" stroke="#fcd34d" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.5" />
          <circle cx="100" cy="20" r="2.5" fill="#fbbf24" />
          <circle cx="160" cy="80" r="2" fill="#fbbf24" />
          <circle cx="40" cy="80" r="2" fill="#fbbf24" />
          <circle cx="100" cy="120" r="2.5" fill="#f59e0b" />
          <circle cx="100" cy="180" r="2" fill="#fbbf24" />
        </svg>
      </motion.div>

      {/* 2. Geometric Hexagonal / Icosahedron Facet (AI Violet / Purple) */}
      <motion.div
        className="absolute top-[35%] left-[8%] w-40 h-40 sm:w-56 sm:h-56"
        style={{ opacity: opacityMult * 0.9 }}
        initial={{ y: 0, rotate: 0 }}
        animate={{
          y: [10, -16, 10],
          rotate: [0, -12, 8, 0],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1.5,
        }}
      >
        <svg viewBox="0 0 200 200" className="w-full h-full filter drop-shadow-[0_0_22px_rgba(168,85,247,0.22)]">
          <defs>
            <linearGradient id="purpGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.04" />
            </linearGradient>
            <linearGradient id="purpGrad2" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#c084fc" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#7e22ce" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <polygon points="100,15 175,55 175,145 100,185 25,145 25,55" fill="none" stroke="#a855f7" strokeWidth="1" strokeOpacity="0.5" />
          <polygon points="100,50 150,80 150,135 100,160 50,135 50,80" fill="url(#purpGrad)" stroke="#c084fc" strokeWidth="1.2" strokeOpacity="0.8" />
          <polygon points="100,15 100,50 150,80 175,55" fill="url(#purpGrad2)" stroke="#a855f7" strokeWidth="0.8" strokeOpacity="0.4" />
          <polygon points="175,145 150,135 100,160 100,185" fill="url(#purpGrad)" stroke="#a855f7" strokeWidth="0.8" strokeOpacity="0.4" />
          <circle cx="100" cy="50" r="2.5" fill="#e9d5ff" />
          <circle cx="150" cy="80" r="2" fill="#c084fc" />
          <circle cx="100" cy="160" r="2.5" fill="#e9d5ff" />
          <circle cx="50" cy="80" r="2" fill="#c084fc" />
        </svg>
      </motion.div>

      {/* 3. Wireframe Polyhedron Crystal (Tech Cyan / Sky) */}
      <motion.div
        className="absolute bottom-[10%] right-[25%] w-36 h-36 sm:w-48 sm:h-48"
        style={{ opacity: opacityMult * 0.85 }}
        initial={{ y: 0, rotate: 0 }}
        animate={{
          y: [-8, 12, -8],
          rotate: [0, 15, -10, 0],
        }}
        transition={{
          duration: 16,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 2.5,
        }}
      >
        <svg viewBox="0 0 180 180" className="w-full h-full filter drop-shadow-[0_0_18px_rgba(6,182,212,0.25)]">
          <defs>
            <linearGradient id="cyanGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.04" />
            </linearGradient>
          </defs>
          <polygon points="90,15 155,60 135,145 45,145 25,60" fill="url(#cyanGrad)" stroke="#06b6d4" strokeWidth="1.2" strokeOpacity="0.75" />
          <line x1="90" y1="15" x2="90" y2="105" stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.6" />
          <line x1="155" y1="60" x2="90" y2="105" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.6" />
          <line x1="25" y1="60" x2="90" y2="105" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.6" />
          <line x1="135" y1="145" x2="90" y2="105" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.6" />
          <line x1="45" y1="145" x2="90" y2="105" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.6" />
          <circle cx="90" cy="15" r="2" fill="#67e8f9" />
          <circle cx="90" cy="105" r="3" fill="#a5f3fc" />
          <circle cx="155" cy="60" r="2" fill="#67e8f9" />
          <circle cx="25" cy="60" r="2" fill="#67e8f9" />
        </svg>
      </motion.div>
    </div>
  );
}
