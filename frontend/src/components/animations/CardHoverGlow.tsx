import React, { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface CardHoverGlowProps {
  children: React.ReactNode;
  glowColor?: string;
  glowBorderColor?: string;
  className?: string;
  lift?: number;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function CardHoverGlow({
  children,
  glowColor = 'rgba(249, 115, 22, 0.12)',
  glowBorderColor = 'rgba(249, 115, 22, 0.4)',
  className = '',
  lift = 6,
  onClick,
  style = {},
}: CardHoverGlowProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  if (shouldReduceMotion) {
    return (
      <div onClick={onClick} className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={cardRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ y: -lift }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className={`relative overflow-hidden transition-colors ${className}`}
      style={{
        ...style,
        borderColor: isHovered ? glowBorderColor : undefined,
      }}
    >
      {/* Dynamic Cursor Radial Spotlight */}
      {isHovered && (
        <div
          className="pointer-events-none absolute -inset-px transition-opacity duration-300 z-0"
          style={{
            background: `radial-gradient(350px circle at ${mousePos.x}px ${mousePos.y}px, ${glowColor}, transparent 70%)`,
          }}
        />
      )}
      <div className="relative z-10 w-full h-full">{children}</div>
    </motion.div>
  );
}
