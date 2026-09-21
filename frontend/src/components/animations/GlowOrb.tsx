import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface GlowOrbProps {
  color?: 'orange' | 'cyan' | 'purple' | 'blue' | 'amber';
  size?: number;
  blur?: number;
  opacity?: number;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
  duration?: number;
  floatOffset?: number;
}

const colorMap = {
  orange: 'rgba(249, 115, 22, 0.18)',
  amber: 'rgba(245, 158, 11, 0.18)',
  cyan: 'rgba(6, 182, 212, 0.15)',
  purple: 'rgba(168, 85, 247, 0.16)',
  blue: 'rgba(37, 99, 235, 0.15)',
};

export default function GlowOrb({
  color = 'orange',
  size = 320,
  blur = 100,
  opacity = 0.2,
  className = '',
  style = {},
  delay = 0,
  duration = 8,
  floatOffset = 25,
}: GlowOrbProps) {
  const shouldReduceMotion = useReducedMotion();
  const bg = colorMap[color] || color;

  if (shouldReduceMotion) {
    return (
      <div
        className={`pointer-events-none rounded-full absolute ${className}`}
        style={{
          width: size,
          height: size,
          background: bg,
          filter: `blur(${blur}px)`,
          opacity,
          ...style,
        }}
      />
    );
  }

  return (
    <motion.div
      className={`pointer-events-none rounded-full absolute ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        filter: `blur(${blur}px)`,
        ...style,
      }}
      initial={{ opacity: opacity * 0.7, scale: 0.95 }}
      animate={{
        opacity: [opacity * 0.7, opacity * 1.2, opacity * 0.7],
        scale: [0.95, 1.08, 0.95],
        x: [0, floatOffset, 0],
        y: [0, -floatOffset, 0],
      }}
      transition={{
        duration,
        repeat: Infinity,
        repeatType: 'mirror',
        ease: 'easeInOut',
        delay,
      }}
    />
  );
}
