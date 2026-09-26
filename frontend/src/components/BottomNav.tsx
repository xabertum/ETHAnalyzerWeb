import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const icons = {
  dashboard: (
    <svg {...iconProps}>
      <path d="M3 16.5 9 10l4 4 7.5-7.5" />
      <path d="M21 10V6h-4" />
      <path d="M3 21h18" />
    </svg>
  ),
  transactions: (
    <svg {...iconProps}>
      <path d="M4 7h11" />
      <path d="m12 4 3 3-3 3" />
      <path d="M20 17H9" />
      <path d="m12 14-3 3 3 3" />
    </svg>
  ),
  alerts: (
    <svg {...iconProps}>
      <path d="M18 8a6 6 0 1 0-12 0c0 6-3 7-3 7h18s-3-1-3-7" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  ),
  settings: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </svg>
  ),
};

export function BottomNav({ unreadCount }: { unreadCount: number }) {
  const items: NavItem[] = [
    { to: '/dashboard', label: 'Resumen', icon: icons.dashboard },
    { to: '/operaciones', label: 'Operaciones', icon: icons.transactions },
    { to: '/alertas', label: 'Alertas', icon: icons.alerts, badge: unreadCount },
    { to: '/ajustes', label: 'Ajustes', icon: icons.settings },
  ];

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} className="bottom-nav-item">
          <span className="bottom-nav-icon">
            {item.icon}
            {item.badge ? <span className="bottom-nav-badge">{item.badge}</span> : null}
          </span>
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
