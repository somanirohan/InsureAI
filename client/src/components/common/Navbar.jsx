import React, { useState } from 'react';
import {
  LayoutGrid,
  MessageSquare,
  DollarSign,
  GitCompare,
  Shield,
  LogOut,
  User,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { id: 'dashboard', label: 'Dashboard',     icon: LayoutGrid },
  { id: 'chat',      label: 'AI Assistant',  icon: MessageSquare },
  { id: 'cost',      label: 'Cost',          icon: DollarSign },
  { id: 'compare',   label: 'Compare',       icon: GitCompare },
];

// ─── Desktop Sidebar ───────────────────────────────────────
export function Sidebar({ activeTab, setActiveTab }) {
  const { user, logout } = useAuth();

  return (
    <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 h-screen sticky top-0 border-r border-black/[0.07] bg-white">
      {/* Logo */}
      <div className="px-5 pt-7 pb-6">
        <button
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-2.5"
        >
          <div className="w-8 h-8 rounded-[10px] bg-zinc-900 flex items-center justify-center flex-shrink-0">
            <Shield size={15} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-zinc-900">MedShield</p>
            <p className="text-2xs text-zinc-400">Policy Intelligence</p>
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
              onClick={() => setActiveTab(id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                ${isActive
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={15} className={isActive ? 'text-white' : 'text-zinc-400'} />
              <span className="flex-1 text-left">{label}</span>
              {isActive && <ChevronRight size={12} className="text-zinc-400" />}
            </button>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="px-3 pb-5 border-t border-black/[0.07] pt-4">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
          <div className="w-7 h-7 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center flex-shrink-0">
            <User size={13} className="text-zinc-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-zinc-700 truncate leading-tight">
              {user?.full_name?.split(' ')[0] || 'User'}
            </p>
            <p className="text-2xs text-zinc-400 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="btn-destructive p-1.5 rounded-lg transition-colors"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Mobile Top Bar ────────────────────────────────────────
export function MobileTopBar({ activeTab, setActiveTab }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const activeItem = navItems.find(i => i.id === activeTab);

  return (
    <>
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-white/90 backdrop-blur-xl border-b border-black/[0.07]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[8px] bg-zinc-900 flex items-center justify-center">
            <Shield size={13} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-semibold tracking-tight text-zinc-900">MedShield</span>
        </div>
        {activeItem && (
          <span className="text-sm font-medium text-zinc-400">{activeItem.label}</span>
        )}
        <button
          onClick={() => setOpen(true)}
          className="btn-ghost p-2 rounded-xl"
          aria-label="Open navigation"
        >
          <Menu size={18} className="text-zinc-600" />
        </button>
      </header>

      {/* Drawer overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <nav
            className="relative ml-auto w-64 h-full bg-white border-l border-black/[0.07] flex flex-col animate-slide-in shadow-lg"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.07]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-[8px] bg-zinc-900 flex items-center justify-center">
                  <Shield size={13} className="text-white" strokeWidth={2.5} />
                </div>
                <span className="text-sm font-semibold text-zinc-900">MedShield</span>
              </div>
              <button onClick={() => setOpen(false)} className="btn-ghost p-1.5 rounded-lg">
                <X size={16} className="text-zinc-500" />
              </button>
            </div>
            <div className="flex-1 px-3 py-4 space-y-0.5">
              {navItems.map(({ id, label, icon: Icon }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => { setActiveTab(id); setOpen(false); }}
                    className={`
                      w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all
                      ${isActive
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
                      }
                    `}
                  >
                    <Icon size={15} className={isActive ? 'text-white' : 'text-zinc-400'} />
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="px-4 pb-6 pt-3 border-t border-black/[0.07]">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                  <User size={13} className="text-zinc-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-700 truncate">{user?.full_name}</p>
                  <p className="text-2xs text-zinc-400 truncate">{user?.email}</p>
                </div>
              </div>
              <button onClick={logout} className="btn btn-secondary w-full text-xs gap-2">
                <LogOut size={13} />Sign out
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
