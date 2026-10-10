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
        collapsed ? 'w-18' : 'w-60'
      }`}
      style={{
        background: '#ffffff',
        borderRight: '1.5px solid rgba(6,35,39,0.08)',
        zIndex: 20,
      }}
    >
      {/* Header with toggle */}
      <div className={`pt-6 pb-5 ${collapsed ? 'px-2 flex flex-col items-center gap-3' : 'px-5 flex items-center justify-between'}`}>
        {!collapsed ? (
          <>
            <button
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-3 group min-w-0 cursor-pointer"
              title="InsurAI Dashboard"
            >
              <div
                className="w-9 h-9 rounded-2xl bg-[#d2f57b] border-2 border-[#062327] flex items-center justify-center flex-shrink-0 p-1 group-hover:scale-105 transition-transform shadow-sm"
              >
                <img src="/favicon_io/apple-touch-icon.png" alt="InsurAI Logo" className="w-full h-full object-contain rounded-xl" />
              </div>
              <div className="min-w-0 text-left">
                <p className="font-headline text-base font-bold tracking-tight text-[#062327] truncate leading-tight">InsurAI</p>
                <p className="text-[11px] text-[#558187] truncate font-medium">Policy Intelligence</p>
              </div>
            </button>
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-xl text-[#558187] hover:text-[#062327] hover:bg-[#062327]/08 transition-colors flex-shrink-0 cursor-pointer"
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
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[#558187] hover:text-[#062327] hover:bg-[#062327]/08 transition-colors cursor-pointer"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <Menu size={17} />
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className="w-9 h-9 rounded-2xl bg-[#d2f57b] border-2 border-[#062327] flex items-center justify-center flex-shrink-0 p-1 hover:scale-105 transition-transform cursor-pointer shadow-sm"
              title="InsurAI Dashboard"
            >
              <img src="/favicon_io/apple-touch-icon.png" alt="InsurAI Logo" className="w-full h-full object-contain rounded-xl" />
            </button>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav
        className={`flex-1 flex flex-col justify-center ${
          collapsed
            ? 'items-center gap-3 px-2'
            : 'px-4 space-y-1.5'
        }`}
      >
        {!collapsed && <p className="text-[11px] font-bold uppercase tracking-wider text-[#558187] px-3 mb-2">Navigation</p>}
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          if (collapsed) {
            return (
              <button
                key={id}
                id={`nav-${id}`}
                onClick={() => setActiveTab(id)}
                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 relative group cursor-pointer ${
                  isActive
                    ? 'bg-[#d2f57b] text-[#062327] shadow-[0_3px_0_#062327] border-2 border-[#062327] font-bold'
                    : 'text-[#558187] hover:text-[#062327] hover:bg-[#062327]/08'
                }`}
                title={label}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={18} className={isActive ? 'stroke-[2.5]' : ''} />
                {/* Floating tooltip */}
                <span className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#062327] text-xs font-bold text-white shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
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
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-[#d2f57b] text-[#062327] shadow-[0_3px_0_#062327] border-2 border-[#062327]'
                  : 'text-[#558187] hover:text-[#062327] hover:bg-[#062327]/08'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon
                size={16}
                className={isActive ? 'stroke-[2.5]' : 'opacity-80'}
              />
              <span className="flex-1 text-left">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* User Footer */}
      <div
        className={`pb-5 pt-4 ${collapsed ? 'px-2 flex flex-col items-center gap-2' : 'px-4'}`}
        style={{ borderTop: '1.5px solid rgba(6,35,39,0.08)' }}
      >
        {!collapsed ? (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-[#f5f8f8] border border-[#062327]/08">
            <div
              className="w-8 h-8 rounded-xl bg-[#d2f57b] border-2 border-[#062327] text-[#062327] flex items-center justify-center flex-shrink-0 font-bold"
            >
              <User size={14} className="stroke-[2.5]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#062327] truncate leading-tight">
                {user?.full_name?.split(' ')[0] || 'User'}
              </p>
              <p className="text-[11px] text-[#558187] truncate leading-tight">
                {user?.email || ''}
              </p>
            </div>
            <button
              id="nav-logout"
              onClick={logout}
              className="p-1.5 rounded-xl text-[#558187] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-9 h-9 rounded-xl bg-[#d2f57b] border-2 border-[#062327] text-[#062327] flex items-center justify-center"
              title={user?.full_name || 'User profile'}
            >
              <User size={15} className="stroke-[2.5]" />
            </div>
            <button
              id="nav-logout"
              onClick={logout}
              className="p-2 rounded-xl text-[#558187] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={15} />
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
          background: 'rgba(255,255,255,0.95)',
          borderBottom: '1.5px solid rgba(6,35,39,0.08)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl bg-[#d2f57b] border-2 border-[#062327] overflow-hidden flex items-center justify-center flex-shrink-0 p-1 shadow-sm"
          >
            <img src="/favicon_io/apple-touch-icon.png" alt="InsurAI Logo" className="w-full h-full object-contain rounded-lg" />
          </div>
          <span className="font-headline text-base font-bold text-[#062327] tracking-tight">InsurAI</span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="p-2 rounded-xl text-[#558187] hover:text-[#062327] hover:bg-[#062327]/08 cursor-pointer"
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Mobile Drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(6,35,39,0.25)', backdropFilter: 'blur(8px)' }}
            onClick={() => setOpen(false)}
          />
          <nav
            className="fixed top-0 left-0 bottom-0 z-50 w-72 flex flex-col py-8 px-5 animate-slide-in"
            style={{
              background: '#ffffff',
              borderRight: '1.5px solid rgba(6,35,39,0.10)',
              boxShadow: '0 24px 80px rgba(6,35,39,0.18)',
            }}
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-xl bg-[#d2f57b] border-2 border-[#062327] overflow-hidden flex items-center justify-center flex-shrink-0 p-1"
                >
                  <img src="/favicon_io/apple-touch-icon.png" alt="InsurAI Logo" className="w-full h-full object-contain rounded-lg" />
                </div>
                <div>
                  <span className="font-headline text-base font-bold text-[#062327] block leading-tight">InsurAI</span>
                  <span className="text-[11px] text-[#558187]">Policy Intelligence</span>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-xl text-[#558187] hover:text-[#062327] hover:bg-[#062327]/08"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1.5 flex-1">
              {navItems.map(({ id, label, icon: Icon }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => { setActiveTab(id); setOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-full text-sm font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#d2f57b] text-[#062327] shadow-[0_3px_0_#062327] border-2 border-[#062327]'
                        : 'text-[#558187] hover:text-[#062327] hover:bg-[#062327]/08'
                    }`}
                  >
                    <Icon size={16} className={isActive ? 'stroke-[2.5]' : ''} />
                    {label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => { logout(); setOpen(false); }}
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold rounded-full bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 cursor-pointer"
            >
              <LogOut size={15} />
              Logout
            </button>
          </nav>
        </>
      )}
    </>
  );
}
