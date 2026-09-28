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
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('insurai_sidebar_collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('insurai_sidebar_collapsed', String(next));
      return next;
    });
  };

  return (
    <aside
      className={`hidden lg:flex flex-col flex-shrink-0 h-screen sticky top-0 transition-all duration-300 ease-in-out relative ${
        collapsed ? 'w-16' : 'w-56'
      }`}
      style={{
        background: 'rgba(8,8,18,0.85)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 20,
      }}
    >
      {/* Header with 3 lines toggle */}
      <div className={`pt-6 pb-5 ${collapsed ? 'px-2 flex flex-col items-center gap-3' : 'px-4 flex items-center justify-between'}`}>
        {!collapsed ? (
          <>
            <button
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-3 group min-w-0"
              title="InsurAI Dashboard"
            >
              <div
                className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 p-0.5 group-hover:scale-105 transition-transform"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(200,169,110,0.35)',
                  boxShadow: '0 0 16px rgba(200,169,110,0.20)',
                }}
              >
                <img src="/favicon_io/apple-touch-icon.png" alt="InsurAI Logo" className="w-full h-full object-contain rounded-lg" />
              </div>
              <div className="min-w-0 text-left">
                <p className="text-sm font-semibold tracking-tight text-[#f0f0f8] truncate">InsurAI</p>
                <p className="text-[10px] text-white/30 truncate">Policy Intelligence</p>
              </div>
            </button>
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors flex-shrink-0"
              title="Minimize sidebar"
              aria-label="Minimize sidebar"
            >
              <Menu size={16} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={toggleSidebar}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <Menu size={17} />
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 p-0.5 hover:scale-105 transition-transform"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(200,169,110,0.35)',
                boxShadow: '0 0 16px rgba(200,169,110,0.20)',
              }}
              title="InsurAI Dashboard"
            >
              <img src="/favicon_io/apple-touch-icon.png" alt="InsurAI Logo" className="w-full h-full object-contain rounded-lg" />
            </button>
          </>
        )}
      </div>

      {/* Navigation: Vertically centered both when expanded and when minimized */}
      <nav
        className={`flex-1 flex flex-col justify-center ${
          collapsed
            ? 'items-center gap-3 px-2'
            : 'px-3 space-y-1'
        }`}
      >
        {!collapsed && <p className="label-xs px-2 mb-3">Navigation</p>}
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          if (collapsed) {
            return (
              <button
                key={id}
                id={`nav-${id}`}
                onClick={() => setActiveTab(id)}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 relative group"
                style={isActive ? {
                  background: 'rgba(200,169,110,0.18)',
                  border: '1px solid rgba(200,169,110,0.35)',
                  boxShadow: '0 0 14px rgba(200,169,110,0.20)',
                  color: '#e8c97e',
                } : {
                  background: 'transparent',
                  border: '1px solid transparent',
                  color: 'rgba(255,255,255,0.40)',
                }}
                title={label}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.40)';
                  }
                }}
              >
                <Icon
                  size={18}
                  style={{ color: isActive ? '#c8a96e' : 'currentColor' }}
                />
                {/* Floating tooltip */}
                <span className="absolute left-full ml-3 px-2.5 py-1 rounded-lg bg-[#141420] border border-white/10 text-xs font-medium text-white shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                  {label}
                </span>
              </button>
            );
          }

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
        className={`pb-5 pt-4 ${collapsed ? 'px-2 flex flex-col items-center gap-2' : 'px-3'}`}
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        {!collapsed ? (
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
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(200,169,110,0.20), rgba(80,60,180,0.20))',
                border: '1px solid rgba(200,169,110,0.25)',
              }}
              title={user?.full_name || 'User profile'}
            >
              <User size={13} style={{ color: '#c8a96e' }} />
            </div>
            <button
              id="nav-logout"
              onClick={logout}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
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
            className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 p-0.5"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(200,169,110,0.35)',
            }}
          >
            <img src="/favicon_io/apple-touch-icon.png" alt="InsurAI Logo" className="w-full h-full object-contain rounded-md" />
          </div>
          <span className="text-sm font-semibold" style={{ color: '#f0f0f8' }}>InsurAI</span>
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
                  className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 p-0.5"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(200,169,110,0.35)',
                  }}
                >
                  <img src="/favicon_io/apple-touch-icon.png" alt="InsurAI Logo" className="w-full h-full object-contain rounded-md" />
                </div>
                <span className="text-sm font-semibold" style={{ color: '#f0f0f8' }}>InsurAI</span>
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
