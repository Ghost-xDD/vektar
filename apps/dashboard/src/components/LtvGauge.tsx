import { useEffect, useRef } from 'react';

interface LtvGaugeProps {
  label: string;
  value: number; // 0-100
  maxBorrow: number;
  isStatic?: boolean;
  isActive?: boolean;
}

function getColor(value: number, isStatic: boolean): string {
  if (isStatic) return '#10b981'; // always green for static
  if (value === 0) return '#374151';
  if (value > 60) return '#10b981';
  if (value > 40) return '#f59e0b';
  if (value > 20) return '#f97316';
  return '#ef4444';
}

function getGlowColor(value: number, isStatic: boolean): string {
  if (isStatic) return 'rgba(16, 185, 129, 0.3)';
  if (value === 0) return 'transparent';
  if (value > 60) return 'rgba(16, 185, 129, 0.3)';
  if (value > 40) return 'rgba(245, 158, 11, 0.3)';
  if (value > 20) return 'rgba(249, 115, 22, 0.3)';
  return 'rgba(239, 68, 68, 0.3)';
}

export function LtvGauge({ label, value, maxBorrow, isStatic = false, isActive = true }: LtvGaugeProps) {
  const circleRef = useRef<SVGCircleElement>(null);

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const startAngle = 135; // degrees from top (start of arc)
  const arcLength = 270; // degrees of the arc
  const arcCircumference = (arcLength / 360) * circumference;
  const offset = arcCircumference - (arcCircumference * Math.min(value, 100)) / 100;
  const color = getColor(value, isStatic);
  const glowColor = getGlowColor(value, isStatic);

  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.6s ease';
    }
  }, [value]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-44">
        <svg viewBox="0 0 180 160" className="w-full h-full">
          {/* Glow filter */}
          <defs>
            <filter id={`glow-${label}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background arc */}
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke="#1a1a2e"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${arcCircumference} ${circumference}`}
            transform={`rotate(${startAngle} 90 90)`}
          />

          {/* Tick marks */}
          {[0, 25, 50, 75, 100].map((tick) => {
            const angle = startAngle + (tick / 100) * arcLength;
            const rad = (angle * Math.PI) / 180;
            const innerR = radius - 8;
            const outerR = radius + 8;
            const x1 = 90 + innerR * Math.cos(rad);
            const y1 = 90 + innerR * Math.sin(rad);
            const x2 = 90 + outerR * Math.cos(rad);
            const y2 = 90 + outerR * Math.sin(rad);
            return (
              <line
                key={tick}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#2a2a4a"
                strokeWidth="1.5"
              />
            );
          })}

          {/* Value arc */}
          <circle
            ref={circleRef}
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke={isActive ? color : '#374151'}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${arcCircumference} ${circumference}`}
            strokeDashoffset={isActive ? offset : arcCircumference}
            transform={`rotate(${startAngle} 90 90)`}
            filter={isActive && value > 0 ? `url(#glow-${label})` : undefined}
            style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.6s ease' }}
          />

          {/* Center value */}
          <text
            x="90"
            y="82"
            textAnchor="middle"
            fill={isActive ? color : '#4b5563'}
            fontSize="32"
            fontWeight="700"
            fontFamily="Inter, sans-serif"
          >
            {isActive && value > 0 ? `${value.toFixed(1)}%` : '—'}
          </text>

          {/* Label */}
          <text
            x="90"
            y="105"
            textAnchor="middle"
            fill="#6b7280"
            fontSize="11"
            fontWeight="500"
            fontFamily="Inter, sans-serif"
            textTransform="uppercase"
            letterSpacing="0.1em"
          >
            {label}
          </text>
        </svg>

        {/* Glow behind gauge */}
        {isActive && value > 0 && (
          <div
            className="absolute inset-0 rounded-full blur-3xl opacity-20 pointer-events-none"
            style={{ background: glowColor }}
          />
        )}
      </div>

      {/* Max borrow */}
      <div className="text-center -mt-2">
        <p className="text-xs text-white/40 mb-0.5">Max Borrow</p>
        <p className="text-lg font-semibold font-mono" style={{ color: isActive && value > 0 ? color : '#4b5563' }}>
          {isActive && maxBorrow > 0 ? `$${maxBorrow.toLocaleString()}` : '—'}
        </p>
      </div>
    </div>
  );
}
