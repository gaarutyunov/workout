import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSync } from '../context/DatabaseContext';

const NAV = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/body', label: 'Body', icon: '💪' },
  { to: '/nutrition', label: 'Food', icon: '🍽️' },
  { to: '/chat', label: 'Coach', icon: '💬' },
];

export function Layout({ children }: { children: ReactNode }) {
  const sync = useSync();
  return (
    <div className="app">
      <header className="topbar">
        <h1>Fitness Tracker</h1>
        <div className="row">
          <span className={`sync-dot ${sync.isRunning ? 'on' : ''}`}>
            {sync.isRunning ? '☁ synced' : '○ local'}
          </span>
          <Link to="/settings" title="Settings" style={{ fontSize: 18 }}>
            ⚙
          </Link>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <nav className="bottom-nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="icon">{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
