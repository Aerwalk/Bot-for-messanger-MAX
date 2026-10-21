import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', tab: 'home', label: 'Поиск', emoji: '🔍' },
  { to: '/my', tab: 'my', label: 'Мои записи', emoji: '📋' },
  { to: '/profile', tab: 'profile', label: 'Профиль', emoji: '👤' },
];

export function TabBar() {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <NavLink
          key={t.tab}
          to={t.to}
          className={({ isActive }) => `tabbar__item${isActive ? ' tabbar__item--active' : ''}`}
        >
          <span className="tabbar__emoji">{t.emoji}</span>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}