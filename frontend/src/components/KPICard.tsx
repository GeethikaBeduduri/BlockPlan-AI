import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  suffix?: string;
  trend?: { value: string; direction: 'up' | 'down' | 'flat' };
  variant?: 'critical' | 'success' | 'warning' | 'info';
  icon?: ReactNode;
  tooltip?: string;
}

export default function KPICard({ title, value, suffix, trend, variant = 'info', icon, tooltip }: KPICardProps) {
  const TrendIcon = trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : Minus;
  const trendColor = trend?.direction === 'up' ? 'text-green-600' : trend?.direction === 'down' ? 'text-red-600' : 'text-gray-500';

  return (
    <div className={`kpi-card kpi-card--${variant}`}>
      <div className="flex items-start justify-between mb-3">
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
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-extrabold text-navy-900 tracking-tight">{value}</span>
        {suffix && <span className="text-sm font-semibold text-gray-400 mb-1">{suffix}</span>}
      </div>
      {trend && (
        <div className={`flex items-center gap-1 mt-2 ${trendColor}`}>
          <TrendIcon className="w-3.5 h-3.5" />
          <span className="text-xs font-semibold">{trend.value}</span>
        </div>
      )}
    </div>
  );
}
