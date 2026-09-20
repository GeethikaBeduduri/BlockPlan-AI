import { getCriticalityBadge, getCriticalityLevel } from '../adapters/formatters';

interface CriticalityBadgeProps {
  score: number | null | undefined;
  showScore?: boolean;
  size?: 'sm' | 'md';
}

export default function CriticalityBadge({
  score,
  showScore = true,
  size = 'md',
}: CriticalityBadgeProps) {
  const level = getCriticalityLevel(score ?? null);
  const badgeStyle = getCriticalityBadge(score ?? null);
  const variant =
    score !== null && score !== undefined
      ? score >= 90
        ? 'critical'
        : score >= 70
        ? 'high'
        : score >= 40
        ? 'medium'
        : 'low'
      : 'low';

  const displayValue =
    score !== null && score !== undefined
      ? showScore
        ? `${typeof score === 'number' ? score.toFixed(1) : score}`
        : level
      : 'Unscored';

  return (
    <span
      className={`badge badge--${variant} ${
        size === 'sm' ? 'text-[10px] px-2 py-0.5' : ''
      }`}
      style={score === null || score === undefined ? { background: '#f3f4f6', color: '#6b7280', borderColor: '#e5e7eb' } : undefined}
    >
      <span
        className="inline-block rounded-full"
        style={{
          width: size === 'sm' ? 5 : 6,
          height: size === 'sm' ? 5 : 6,
          background: badgeStyle.color,
        }}
      />
      {displayValue}
    </span>
  );
}
