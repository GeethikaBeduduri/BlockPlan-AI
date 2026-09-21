import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

export interface AnimatedNumberProps {
  value: number | string;
  duration?: number;
  className?: string;
}

export default function AnimatedNumber({
  value,
  duration = 1000,
  className = '',
}: AnimatedNumberProps) {
  const shouldReduceMotion = useReducedMotion();
  const rawNumber = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]+/g, ''));
  const isNumeric = !isNaN(rawNumber);
  const decimals = typeof value === 'string' && value.includes('.') ? value.split('.')[1]?.length || 0 : (rawNumber % 1 !== 0 ? 1 : 0);

  const [displayValue, setDisplayValue] = useState<number>(shouldReduceMotion || !isNumeric ? rawNumber : 0);

  useEffect(() => {
    if (shouldReduceMotion || !isNumeric) {
      setDisplayValue(rawNumber);
      return;
    }

    let start = 0;
    const startTime = performance.now();

    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (rawNumber - start) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        setDisplayValue(rawNumber);
      }
    };

    const animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, [rawNumber, duration, shouldReduceMotion, isNumeric]);

  if (!isNumeric) {
    return <span className={className}>{value}</span>;
  }

  const formatted = decimals > 0 ? displayValue.toFixed(decimals) : Math.round(displayValue).toString();

  return <span className={className}>{formatted}</span>;
}
