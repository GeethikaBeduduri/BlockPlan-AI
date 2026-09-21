import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface RevealOnScrollProps {
  children: ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right' | 'fade' | 'zoom';
  delay?: number;
  duration?: number;
  className?: string;
  amount?: number | 'some' | 'all';
}

export default function RevealOnScroll({
  children,
  direction = 'up',
  delay = 0,
  duration = 0.5,
  className = '',
  amount = 0.15,
}: RevealOnScrollProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  const getInitial = () => {
    switch (direction) {
      case 'up':
        return { opacity: 0, y: 24 };
      case 'down':
        return { opacity: 0, y: -24 };
      case 'left':
        return { opacity: 0, x: -24 };
      case 'right':
        return { opacity: 0, x: 24 };
      case 'zoom':
        return { opacity: 0, scale: 0.94 };
      case 'fade':
      default:
        return { opacity: 0 };
    }
  };

  const getTarget = () => {
    switch (direction) {
      case 'up':
      case 'down':
        return { opacity: 1, y: 0 };
      case 'left':
      case 'right':
        return { opacity: 1, x: 0 };
      case 'zoom':
        return { opacity: 1, scale: 1 };
      case 'fade':
      default:
        return { opacity: 1 };
    }
  };

  return (
    <motion.div
      initial={getInitial()}
      whileInView={getTarget()}
      viewport={{ once: true, amount }}
      transition={{
        duration,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
