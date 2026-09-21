import FloatingParticles from './FloatingParticles';
import GlowOrb from './GlowOrb';
import FloatingShapes from './FloatingShapes';
import AnimatedGrid from './AnimatedGrid';

export interface AnimatedBackgroundProps {
  showParticles?: boolean;
  showGrid?: boolean;
  showShapes?: boolean;
  showOrbs?: boolean;
  intensity?: 'subtle' | 'medium' | 'high';
  theme?: 'railway' | 'admin' | 'department' | 'all';
  className?: string;
}

export default function AnimatedBackground({
  showParticles = true,
  showGrid = true,
  showShapes = true,
  showOrbs = true,
  intensity = 'subtle',
  theme = 'all',
  className = '',
}: AnimatedBackgroundProps) {
  const orbOpacity = intensity === 'subtle' ? 0.12 : intensity === 'medium' ? 0.18 : 0.25;

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
      aria-hidden="true"
    >
      {/* 1. Base Gradient Depth */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(15, 23, 42, 0.45) 0%, rgba(6, 6, 8, 0.95) 75%)',
        }}
      />

      {/* 2. Ambient Blurred Glow Orbs */}
      {showOrbs && (
        <>
          {/* Top-Center / Right Railway Amber Orb */}
          {(theme === 'railway' || theme === 'all') && (
            <GlowOrb
              color="orange"
              size={420}
              blur={120}
              opacity={orbOpacity}
              className="top-[-80px] right-[5%]"
              delay={0}
              duration={10}
              floatOffset={30}
            />
          )}

          {/* Left AI Purple Orb */}
          {(theme === 'admin' || theme === 'all') && (
            <GlowOrb
              color="purple"
              size={360}
              blur={130}
              opacity={orbOpacity * 0.9}
              className="top-[35%] left-[-60px]"
              delay={1.5}
              duration={12}
              floatOffset={25}
            />
          )}

          {/* Bottom-Center Tech Cyan Orb */}
          {(theme === 'department' || theme === 'all') && (
            <GlowOrb
              color="cyan"
              size={380}
              blur={110}
              opacity={orbOpacity * 0.85}
              className="bottom-[-70px] right-[25%]"
              delay={3}
              duration={14}
              floatOffset={20}
            />
          )}
        </>
      )}

      {/* 3. Subtle Animated Railway Grid */}
      {showGrid && <AnimatedGrid opacity={intensity === 'subtle' ? 0.05 : 0.08} />}

      {/* 4. Floating 3D Geometric Facets (Infralytix Style) */}
      {showShapes && <FloatingShapes intensity={intensity} />}

      {/* 5. Canvas Floating Particles */}
      {showParticles && (
        <FloatingParticles
          count={intensity === 'subtle' ? 26 : 40}
          connectLines={true}
          speed={0.35}
        />
      )}
    </div>
  );
}
