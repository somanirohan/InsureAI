/**
 * Shared UI primitive components — Apple HIG-inspired, minimal.
 * Import from here to keep design consistent across all views.
 */
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

// ─── Status Badge ──────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    ready:      { label: 'Ready',       cls: 'status-ready' },
    extracting: { label: 'Processing',  cls: 'status-pending' },
    indexed:    { label: 'Indexing',    cls: 'status-pending' },
    uploading:  { label: 'Uploading',   cls: 'status-info' },
    error:      { label: 'Error',       cls: 'status-error' },
  };
  const config = map[status] || { label: 'Unknown', cls: 'status-error' };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.cls}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full bg-current"
        style={status === 'extracting' || status === 'indexed' || status === 'uploading'
          ? { animation: 'pulseDot 1.4s ease-in-out infinite' }
          : {}}
      />
      {config.label}
    </span>
  );
}

// ─── Metric Card ───────────────────────────────────────────
export function MetricCard({ label, value, sub, accent }) {
  return (
    <div className="surface p-5 flex flex-col gap-1">
      <p className="label-xs">{label}</p>
      <p
        className="text-2xl font-semibold tracking-tight leading-none mt-1"
        style={{ color: accent ? '#e8c97e' : '#f0f0f8' }}
      >
        {value}
      </p>
      {sub && <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{sub}</p>}
    </div>
  );
}

// ─── Section Header ────────────────────────────────────────
export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-100 tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/[0.06] flex items-center justify-center mb-4">
          <Icon size={20} className="text-zinc-500" />
        </div>
      )}
      <h3 className="text-sm font-medium text-zinc-200 mb-1">{title}</h3>
      <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── Error Banner ──────────────────────────────────────────
export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/8 border border-red-500/20 text-sm text-red-400 mb-4">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 mt-0.5">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3.5c.4 0 .7.3.7.7v3.4c0 .4-.3.7-.7.7s-.7-.3-.7-.7V5.2c0-.4.3-.7.7-.7zm0 6.5a.85.85 0 1 1 0-1.7.85.85 0 0 1 0 1.7z"/>
      </svg>
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M10.95 3.05a.7.7 0 0 0-.99 0L7 6.01 4.04 3.05a.7.7 0 1 0-.99.99L6.01 7 3.05 9.96a.7.7 0 0 0 .99.99L7 7.99l2.96 2.96a.7.7 0 0 0 .99-.99L7.99 7l2.96-2.96a.7.7 0 0 0 0-.99z"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Spinner ───────────────────────────────────────────────
export function Spinner({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin ${className}`}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.15" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ─── Skeleton ──────────────────────────────────────────────
export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />;
}

// ─── Divider ───────────────────────────────────────────────
export function Divider({ className = '' }) {
  return <hr className={`divider ${className}`} />;
}

// ─── Toggle Switch ─────────────────────────────────────────
export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label className={`flex items-center gap-3 cursor-pointer ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="relative flex-shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="sr-only peer"
          disabled={disabled}
        />
        <div
          className={`
            w-9 h-5 rounded-full transition-all duration-200
            peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-900
          `}
          style={{
            background: checked ? 'rgba(200,169,110,0.85)' : 'rgba(255,255,255,0.10)',
            border: checked ? 'none' : '1px solid rgba(255,255,255,0.10)',
          }}
        />
        <div
          className={`
            absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200
            ${checked ? 'translate-x-4' : 'translate-x-0.5'}
          `}
        />
      </div>
      {(label || description) && (
        <div>
          {label && <p className="text-sm font-medium text-zinc-200">{label}</p>}
          {description && <p className="text-xs text-zinc-500">{description}</p>}
        </div>
      )}
    </label>
  );
}

// ─── Select (Portal-based, never clipped by overflow-hidden) ─
export function Select({ label, value, onChange, options = [], disabled, placeholder = 'Select an option', className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, bottom: undefined, left: 0, width: 0, maxHeight: 220 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;

    setMenuPos({
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(220, Math.max(120, (openUp ? spaceAbove : spaceBelow) - 16)),
    });
  };

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScrollOrResize = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      updatePosition();
    };

    const handleOutsideClick = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption = options.find(opt => String(opt.value) === String(value));
  const displayText = selectedOption ? selectedOption.label : placeholder;

  return (
    <div className={`relative ${className}`}>
      {label && <label className="label-xs block mb-2">{label}</label>}

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            updatePosition();
            setIsOpen(prev => !prev);
          }
        }}
        className="input-field cursor-pointer flex items-center justify-between gap-2 text-left"
        style={{
          borderColor: isOpen ? 'rgba(200, 169, 110, 0.50)' : undefined,
          boxShadow: isOpen ? '0 0 0 3px rgba(200, 169, 110, 0.12)' : undefined,
          userSelect: 'none',
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`truncate text-xs ${selectedOption ? 'text-zinc-100 font-medium' : 'text-zinc-500'}`}>
          {displayText}
        </span>
        <ChevronDown
          size={14}
          className={`text-zinc-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-amber-300' : ''}`}
        />
      </button>

      {/* Portal Dropdown Menu attached to document.body */}
      {isOpen && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="fixed z-[9999] p-1 rounded-xl shadow-2xl overflow-y-auto scroll-area animate-fade-in"
          style={{
            top: menuPos.top !== undefined ? `${menuPos.top}px` : undefined,
            bottom: menuPos.bottom !== undefined ? `${menuPos.bottom}px` : undefined,
            left: `${menuPos.left}px`,
            width: `${menuPos.width}px`,
            maxHeight: `${menuPos.maxHeight}px`,
            background: 'rgba(18, 18, 28, 0.98)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.85), 0 0 1px rgba(255, 255, 255, 0.15)',
          }}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-500 text-center">
              No options available
            </div>
          ) : (
            options.map((opt) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-amber-400/15 text-amber-200 font-semibold'
                      : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white font-normal'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <Check size={13} className="text-amber-300 flex-shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Input ─────────────────────────────────────────────────
export function Input({ label, type = 'text', value, onChange, placeholder, disabled, icon: Icon, className = '' }) {
  return (
    <div className={className}>
      {label && <label className="label-xs block mb-2">{label}</label>}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
            <Icon size={14} />
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="input-field"
          style={Icon ? { paddingLeft: '34px' } : undefined}
        />
      </div>
    </div>
  );
}

// ─── Confidence Badge ──────────────────────────────────────
export function ConfidenceBadge({ level }) {
  if (!level) return null;
  const map = {
    high:   { label: 'High',   cls: 'status-ready' },
    medium: { label: 'Medium', cls: 'status-pending' },
    low:    { label: 'Low',    cls: 'status-error' },
  };
  const config = map[level] || { label: level, cls: 'status-info' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.cls}`}>
      {config.label} confidence
    </span>
  );
}
