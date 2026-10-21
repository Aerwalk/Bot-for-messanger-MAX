import type { RatingAggregate } from '@sport-nearby/shared';

export function formatRatingAvg(avg: number): string {
  return avg.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function RatingBadge({
  agg,
  label,
}: {
  agg: RatingAggregate;
  label?: string;
}) {
  return (
    <span className="rating-badge" title={`${agg.count} ${pluralRating(agg.count)}`}>
      ⭐ {formatRatingAvg(agg.avg)}
      <span className="rating-badge__count">{agg.count}</span>
      {label ? <span className="rating-badge__label">{label}</span> : null}
    </span>
  );
}

export function pluralRating(n: number): string {
  const abs = n % 100;
  const d = n % 10;
  if (abs > 11 && abs < 15) return 'оценок';
  if (d === 1) return 'оценка';
  if (d >= 2 && d <= 4) return 'оценки';
  return 'оценок';
}

export function StarPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="star-picker">
      <span className="star-picker__label">{label}</span>
      <div className="star-picker__row">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`star-picker__btn${n <= value ? ' star-picker__btn--on' : ''}`}
            onClick={() => onChange(n)}
            aria-label={`${label}: ${n}`}
          >
            ★
          </button>
        ))}
        {value > 0 && <span className="star-picker__value">{value}</span>}
      </div>
    </div>
  );
}