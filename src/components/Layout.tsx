import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSync } from '../context/DatabaseContext';
import { Icon, type IconName } from './Icon';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/body', label: 'Body', icon: 'body' },
  { to: '/nutrition', label: 'Food', icon: 'food' },
  { to: '/chat', label: 'Coach', icon: 'chat' },
];

export function Layout({ children }: { children: ReactNode }) {
  const sync = useSync();
  return (
    <div className="app">
      <header className="topbar">
        <h1>Fitness Tracker</h1>
        <div className="row">
          <span className={`sync-dot ${sync.isRunning ? 'on' : ''}`}>
            <Icon name={sync.isRunning ? 'cloud' : 'cloud-off'} size={15} />
            {sync.isRunning ? 'synced' : 'local'}
          </span>
          <Link to="/settings" title="Settings" className="row" style={{ color: 'var(--muted)' }}>
            <Icon name="settings" size={18} />
          </Link>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <nav className="bottom-nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={n.icon} size={20} className="icon" />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
