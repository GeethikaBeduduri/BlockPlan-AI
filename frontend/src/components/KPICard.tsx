import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import AnimatedNumber from './animations/AnimatedNumber';

interface KPICardProps {
  title: string;
  value: string | number;
  suffix?: string;
  trend?: { value: string; direction: 'up' | 'down' | 'flat' };
  variant?: 'critical' | 'success' | 'warning' | 'info';
  icon?: ReactNode;
  tooltip?: string;
}

const variantGlowMap = {
  critical: 'rgba(239, 68, 68, 0.25)',
  warning: 'rgba(245, 158, 11, 0.25)',
  success: 'rgba(34, 197, 94, 0.25)',
  info: 'rgba(37, 99, 235, 0.25)',
};

export default function KPICard({
  title,
  value,
  suffix,
  trend,
  variant = 'info',
  icon,
  tooltip,
}: KPICardProps) {
  const TrendIcon = trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : Minus;
  const trendColor =
    trend?.direction === 'up'
      ? 'text-green-600 dark:text-green-400'
      : trend?.direction === 'down'
      ? 'text-red-600 dark:text-red-400'
      : 'text-gray-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className={`kpi-card kpi-card--${variant} relative overflow-hidden transition-shadow duration-300`}
      style={{
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 8px 24px ${variantGlowMap[variant]}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
      }}
    >
      <div className="flex items-start justify-between mb-3 relative z-10">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</span>
          {tooltip && (
            <div className="group relative">
              <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-navy-900 text-white text-[11px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg">
                {tooltip}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-navy-900" />
              </div>
            </div>
          )}
        </div>
        {icon && (
          <div className="text-gray-400 transition-transform duration-300 group-hover:scale-110">
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-end gap-2 relative z-10">
        <span className="text-3xl font-extrabold text-navy-900 tracking-tight">
          <AnimatedNumber value={value} />
        </span>
        {suffix && <span className="text-sm font-semibold text-gray-400 mb-1">{suffix}</span>}
      </div>
      {trend && (
        <div className={`flex items-center gap-1 mt-2 relative z-10 ${trendColor}`}>
          <TrendIcon className="w-3.5 h-3.5" />
          <span className="text-xs font-semibold">{trend.value}</span>
        </div>
      )}
    </motion.div>
  );
}
