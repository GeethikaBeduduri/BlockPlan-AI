export interface AnimatedGridProps {
  className?: string;
  variant?: 'perspective' | 'mesh' | 'railway';
  opacity?: number;
}

export default function AnimatedGrid({
  className = '',
  variant = 'railway',
  opacity = 0.07,
}: AnimatedGridProps) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
      style={{ opacity }}
    >
      {variant === 'railway' ? (
        /* Railway perspective track grid */
        <div className="w-full h-full relative">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(249, 115, 22, 0.4) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255, 255, 255, 0.15) 1px, transparent 1px)
              `,
              backgroundSize: '48px 48px',
              maskImage: 'radial-gradient(ellipse 80% 60% at 50% 50%, #000 30%, transparent 85%)',
              WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 50%, #000 30%, transparent 85%)',
            }}
          />
          {/* Subtle moving horizon light beam */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(249,115,22,0.6) 50%, transparent 100%)',
              animation: 'pulse 4s ease-in-out infinite',
            }}
          />
        </div>
      ) : (
        /* Tech isometric mesh grid */
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
              radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.25) 1px, transparent 0)
            `,
            backgroundSize: '32px 32px',
            maskImage: 'radial-gradient(circle at 50% 50%, #000 20%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(circle at 50% 50%, #000 20%, transparent 80%)',
          }}
        />
      )}
    </div>
  );
}
