import React, { useState } from 'react';
import {
  LayoutGrid,
  MessageSquare,
  DollarSign,
  GitCompare,
  Shield,
  LogOut,
  User,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { id: 'dashboard', label: 'Dashboard',    icon: LayoutGrid },
  { id: 'chat',      label: 'AI Assistant', icon: MessageSquare },
  { id: 'cost',      label: 'Cost',         icon: DollarSign },
  { id: 'compare',   label: 'Compare',      icon: GitCompare },
];

// ─── Desktop Sidebar ────────────────────────────────────────
export function Sidebar({ activeTab, setActiveTab }) {
  const { user, logout } = useAuth();

  return (
    <aside
      className="hidden lg:flex flex-col w-56 flex-shrink-0 h-screen sticky top-0"
      style={{
        background: 'rgba(8,8,18,0.85)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 20,
      }}
    >
      {/* Logo */}
      <div className="px-5 pt-7 pb-6">
        <button
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-3 group"
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(240,200,100,0.25), rgba(80,60,200,0.30))',
              border: '1px solid rgba(200,169,110,0.35)',
              boxShadow: '0 0 16px rgba(200,169,110,0.20)',
            }}
          >
            <Shield size={14} className="text-gold" style={{ color: '#c8a96e' }} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight" style={{ color: '#f0f0f8' }}>MedShield</p>
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.30)' }}>Policy Intelligence</p>
          </div>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        <p className="label-xs px-2 mb-3">Navigation</p>
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              id={`nav-${id}`}
              onClick={() => setActiveTab(id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
              style={isActive ? {
                background: 'rgba(200,169,110,0.12)',
                border: '1px solid rgba(200,169,110,0.25)',
                color: '#e8c97e',
              } : {
                background: 'transparent',
                border: '1px solid transparent',
                color: 'rgba(255,255,255,0.40)',
              }}
              aria-current={isActive ? 'page' : undefined}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.color='rgba(255,255,255,0.70)'; }}}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(255,255,255,0.40)'; }}}
            >
              <Icon
                size={14}
                style={{ color: isActive ? '#c8a96e' : 'rgba(255,255,255,0.35)' }}
              />
              <span className="flex-1 text-left">{label}</span>
              {isActive && (
                <div
                  className="w-1 h-1 rounded-full"
                  style={{ background: '#c8a96e' }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* User Footer */}
      <div
        className="px-3 pb-5 pt-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(200,169,110,0.20), rgba(80,60,180,0.20))',
              border: '1px solid rgba(200,169,110,0.25)',
            }}
          >
            <User size={12} style={{ color: '#c8a96e' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate leading-tight" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {user?.full_name?.split(' ')[0] || 'User'}
            </p>
            <p className="text-[10px] truncate leading-tight" style={{ color: 'rgba(255,255,255,0.28)' }}>
              {user?.email || ''}
            </p>
          </div>
          <button
            id="nav-logout"
            onClick={logout}
            className="btn btn-ghost p-1.5 rounded-lg"
            title="Logout"
            style={{ color: 'rgba(255,255,255,0.25)' }}
            onMouseEnter={e => e.currentTarget.style.color='rgba(220,80,80,0.80)'}
            onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,0.25)'}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Mobile Top Bar ─────────────────────────────────────────
export function MobileTopBar({ activeTab, setActiveTab }) {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      <header
        className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3"
        style={{
          background: 'rgba(8,8,18,0.90)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(240,200,100,0.25), rgba(80,60,200,0.30))',
              border: '1px solid rgba(200,169,110,0.35)',
            }}
          >
            <Shield size={13} style={{ color: '#c8a96e' }} strokeWidth={2.5} />
          </div>
          <span className="text-sm font-semibold" style={{ color: '#f0f0f8' }}>MedShield</span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="btn btn-ghost p-2"
          aria-label="Toggle menu"
          style={{ color: 'rgba(255,255,255,0.60)' }}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      {/* Mobile Drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setOpen(false)}
          />
          <nav
            className="fixed top-0 left-0 bottom-0 z-50 w-64 flex flex-col py-8 px-4 animate-slide-in"
            style={{
              background: 'rgba(8,8,22,0.97)',
              borderRight: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
            }}
          >
            <div className="flex items-center justify-between mb-8 px-2">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(240,200,100,0.25), rgba(80,60,200,0.30))',
                    border: '1px solid rgba(200,169,110,0.35)',
                  }}
                >
                  <Shield size={13} style={{ color: '#c8a96e' }} strokeWidth={2.5} />
                </div>
                <span className="text-sm font-semibold" style={{ color: '#f0f0f8' }}>MedShield</span>
              </div>
              <button onClick={() => setOpen(false)} style={{ color: 'rgba(255,255,255,0.40)' }}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-1 flex-1">
              {navItems.map(({ id, label, icon: Icon }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => { setActiveTab(id); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                    style={isActive ? {
                      background: 'rgba(200,169,110,0.12)',
                      border: '1px solid rgba(200,169,110,0.25)',
                      color: '#e8c97e',
                    } : {
                      background: 'transparent',
                      border: '1px solid transparent',
                      color: 'rgba(255,255,255,0.45)',
                    }}
                  >
                    <Icon size={14} style={{ color: isActive ? '#c8a96e' : 'rgba(255,255,255,0.35)' }} />
                    {label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => { logout(); setOpen(false); }}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl"
              style={{ color: 'rgba(255,255,255,0.30)' }}
            >
              <LogOut size={13} />
              Logout
            </button>
          </nav>
        </>
      )}
    </>
  );
}
