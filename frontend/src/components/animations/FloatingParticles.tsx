import { useEffect, useRef } from 'react';

export interface FloatingParticlesProps {
  count?: number;
  connectLines?: boolean;
  className?: string;
  speed?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  alpha: number;
  alphaSpeed: number;
  color: string;
}

const PALETTE = [
  '249, 115, 22',  // Railway Orange
  '245, 158, 11',  // Amber
  '6, 182, 212',   // Tech Cyan
  '168, 85, 247',  // AI Purple
  '99, 102, 241',  // Indigo
  '255, 255, 255', // Pure Star
];

export default function FloatingParticles({
  count = 35,
  connectLines = true,
  className = '',
  speed = 0.4,
}: FloatingParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    // Adaptive particle count for mobile
    const isMobile = width < 768;
    const effectiveCount = isMobile ? Math.min(count, 16) : count;
    const maxLineDist = isMobile ? 80 : 120;

    const particles: Particle[] = [];
    for (let i = 0; i < effectiveCount; i++) {
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const baseAlpha = 0.2 + Math.random() * 0.5;
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        radius: 1 + Math.random() * 2,
        baseAlpha,
        alpha: baseAlpha,
        alphaSpeed: 0.005 + Math.random() * 0.01,
        color,
      });
    }

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    const render = () => {
      if (document.hidden) {
        animId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // Draw subtle connections
      if (connectLines) {
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < maxLineDist) {
              const lineAlpha = (1 - dist / maxLineDist) * 0.12;
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.strokeStyle = `rgba(249, 115, 22, ${lineAlpha})`;
              ctx.lineWidth = 0.8;
              ctx.stroke();
            }
          }
        }
      }

      // Update and draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        p.x += p.vx;
        p.y += p.vy;

        // Wrap around boundaries
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        // Soft pulse
        p.alpha += p.alphaSpeed;
        if (p.alpha > p.baseAlpha + 0.2 || p.alpha < Math.max(0.1, p.baseAlpha - 0.2)) {
          p.alphaSpeed = -p.alphaSpeed;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${Math.max(0.05, p.alpha)})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgba(${p.color}, 0.5)`;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [count, connectLines, speed]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ opacity: 0.85 }}
    />
  );
}
