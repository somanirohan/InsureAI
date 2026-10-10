/**
 * Shared UI primitive components — landing-page light theme.
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
    <div className="bg-white border border-[#062327]/10 p-5 flex flex-col gap-1 rounded-2xl shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#558187]">{label}</p>
      <p
        className="font-headline text-2xl font-bold tracking-tight leading-none mt-1"
        style={{ color: accent ? '#0b3d45' : '#062327' }}
      >
        {value}
      </p>
      {sub && <p className="text-xs mt-1 text-[#558187]">{sub}</p>}
    </div>
  );
}

// ─── Section Header ────────────────────────────────────────
export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h2 className="font-headline text-lg font-bold text-[#062327] tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-[#558187] mt-0.5">{subtitle}</p>}
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
        <div className="w-14 h-14 rounded-3xl bg-[#f5f8f8] border border-[#062327]/10 flex items-center justify-center mb-4 text-[#062327] shadow-sm">
          <Icon size={24} className="stroke-[2.2]" />
        </div>
      )}
      <h3 className="font-headline text-base font-bold text-[#062327] mb-1.5">{title}</h3>
      <p className="text-xs sm:text-sm text-[#558187] max-w-sm leading-relaxed">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ─── Error Banner ──────────────────────────────────────────
export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-700 mb-5 leading-relaxed">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 mt-0.5">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3.5c.4 0 .7.3.7.7v3.4c0 .4-.3.7-.7.7s-.7-.3-.7-.7V5.2c0-.4.3-.7.7-.7zm0 6.5a.85.85 0 1 1 0-1.7.85.85 0 0 1 0 1.7z"/>
      </svg>
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-rose-400 hover:text-rose-600 transition-colors cursor-pointer">
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
  const sizeMap = {
    xs: 14,
    sm: 16,
    md: 20,
    lg: 24,
    xl: 32,
  };
  const numSize = typeof size === 'number' ? size : (sizeMap[size] || parseInt(size, 10) || 16);

  return (
    <svg
      width={numSize}
      height={numSize}
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin inline-block shrink-0 ${className}`}
      style={{ width: `${numSize}px`, height: `${numSize}px`, minWidth: `${numSize}px`, minHeight: `${numSize}px` }}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Skeleton ──────────────────────────────────────────────
export function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded-xl ${className}`} />;
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
            w-10 h-6 rounded-full transition-all duration-200
            peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white
          `}
          style={{
            background: checked ? '#d2f57b' : '#f0f3f3',
            border: checked ? '1.5px solid #062327' : '1.5px solid rgba(6,35,39,0.18)',
          }}
        />
        <div
          className={`
            absolute top-1 w-4 h-4 rounded-full shadow-sm transition-all duration-200
            ${checked ? 'translate-x-5 bg-[#062327]' : 'translate-x-1 bg-white'}
          `}
        />
      </div>
      {(label || description) && (
        <div>
          {label && <p className="text-xs sm:text-sm font-bold text-[#062327]">{label}</p>}
          {description && <p className="text-xs text-[#558187]">{description}</p>}
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
      {label && <label className="text-[11px] font-bold uppercase tracking-wider text-[#558187] block mb-2">{label}</label>}

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
          borderColor: isOpen ? '#062327' : undefined,
          boxShadow: isOpen ? '0 0 0 3px rgba(6, 35, 39, 0.10)' : undefined,
          userSelect: 'none',
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`truncate text-xs ${selectedOption ? 'text-[#062327] font-medium' : 'text-[#558187]'}`}>
          {displayText}
        </span>
        <ChevronDown
          size={14}
          className={`text-[#558187] flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#062327]' : ''}`}
        />
      </button>

      {/* Portal Dropdown Menu attached to document.body */}
      {isOpen && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="fixed z-[9999] p-1.5 rounded-2xl shadow-2xl overflow-y-auto scroll-area animate-fade-in"
          style={{
            top: menuPos.top !== undefined ? `${menuPos.top}px` : undefined,
            bottom: menuPos.bottom !== undefined ? `${menuPos.bottom}px` : undefined,
            left: `${menuPos.left}px`,
            width: `${menuPos.width}px`,
            maxHeight: `${menuPos.maxHeight}px`,
            background: '#ffffff',
            border: '1.5px solid rgba(6, 35, 39, 0.12)',
            boxShadow: '0 16px 48px rgba(6, 35, 39, 0.16)',
          }}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[#558187] text-center">
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
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#d2f57b] text-[#062327] font-bold shadow-sm'
                      : 'text-[#062327] hover:bg-[#f5f8f8] hover:text-[#0b3d45] font-normal'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <Check size={14} className="text-[#062327] stroke-[2.5] flex-shrink-0" />
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
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#558187]">
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
