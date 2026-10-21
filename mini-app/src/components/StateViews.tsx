export function LoadingState({ text = 'Загрузка…' }: { text?: string }) {
  return (
    <div className="state">
      <div className="state__icon">⏳</div>
      <p className="state__text" style={{ animation: 'pulse 1.4s ease-in-out infinite' }}>{text}</p>
      <div className="skeleton" />
      <div className="skeleton" style={{ marginTop: 12 }} />
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <div className="state__icon">⚠️</div>
      <h2 className="state__title">Что-то пошло не так</h2>
      <p className="state__text">{text}</p>
      {onRetry && (
        <button className="btn btn--primary" onClick={onRetry}>Повторить</button>
      )}
    </div>
  );
}

export function EmptyState({ icon = '🏷️', title, text, actions }: { icon?: string; title: string; text: string; actions?: React.ReactNode }) {
  return (
    <div className="state">
      <div className="state__icon">{icon}</div>
      <h2 className="state__title">{title}</h2>
      <p className="state__text">{text}</p>
      {actions}
    </div>
  );
}