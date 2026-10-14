import React from 'react';
import { Check, X, Shield, ShieldCheck, ShieldAlert } from 'lucide-react';

export const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/;

export function evaluatePassword(password = '') {
  const checks = {
    length: password.length >= 8,
    special: SPECIAL_CHAR_REGEX.test(password),
    number: /[0-9]/.test(password),
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;
  const isSatisfied = checks.length && checks.special && checks.number && checks.uppercase && checks.lowercase;

  let label = 'Too Weak';
  let color = 'bg-rose-500';
  let textColor = 'text-rose-400';

  if (score >= 5) {
    label = 'Strong';
    color = 'bg-[#d2f57b]';
    textColor = 'text-[#d2f57b]';
  } else if (score >= 4) {
    label = 'Good';
    color = 'bg-emerald-400';
    textColor = 'text-emerald-400';
  } else if (score >= 3) {
    label = 'Fair';
    color = 'bg-amber-400';
    textColor = 'text-amber-400';
  } else if (score >= 2) {
    label = 'Weak';
    color = 'bg-orange-400';
    textColor = 'text-orange-400';
  }

  return { checks, score, isSatisfied, label, color, textColor };
}

export default function PasswordStrengthIndicator({ password = '', showDetails = true, idPrefix = 'pwd' }) {
  const { checks, score, isSatisfied, label, color, textColor } = evaluatePassword(password);

  const criteria = [
    { key: 'length', text: 'At least 8 characters', satisfied: checks.length },
    { key: 'special', text: 'At least 1 special character (!@#$%^&*)', satisfied: checks.special, highlight: true },
    { key: 'number', text: 'At least 1 number (0-9)', satisfied: checks.number },
    { key: 'uppercase', text: 'At least 1 uppercase letter (A-Z)', satisfied: checks.uppercase },
    { key: 'lowercase', text: 'At least 1 lowercase letter (a-z)', satisfied: checks.lowercase },
  ];

  if (!password && !showDetails) return null;

  return (
    <div className="mt-2.5 space-y-2 select-none" id={`${idPrefix}-strength-container`}>
      {/* Strength Bar */}
      <div className="flex items-center justify-between text-xs font-semibold mb-1">
        <span className="flex items-center gap-1.5 text-[#a2cbcf]">
          {isSatisfied ? (
            <ShieldCheck size={14} className="text-[#d2f57b]" />
          ) : (
            <Shield size={14} className="text-[#6e9ea3]" />
          )}
          Password Security
        </span>
        <span className={`text-xs font-bold ${textColor}`}>
          {password ? label : 'Requirements'}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-1.5 h-1.5">
        {[1, 2, 3, 4, 5].map((level) => {
          const filled = password && score >= level;
          return (
            <div
              key={level}
              className={`h-full rounded-full transition-all duration-300 ${
                filled ? color : 'bg-white/10'
              }`}
            />
          );
        })}
      </div>

      {/* Rules Checklist */}
      {showDetails && (
        <ul className="pt-1.5 space-y-1.5 text-xs text-[#a2cbcf]" id={`${idPrefix}-rules`}>
          {criteria.map((item) => {
            const active = item.satisfied;
            return (
              <li
                key={item.key}
                className={`flex items-center gap-2 transition-colors duration-200 ${
                  active ? 'text-[#d2f57b] font-medium' : 'text-[#6e9ea3]'
                } ${item.highlight && !active && password ? 'text-amber-300 font-medium' : ''}`}
              >
                <span
                  className={`w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] transition-all duration-200 ${
                    active
                      ? 'bg-[#d2f57b]/20 text-[#d2f57b] border border-[#d2f57b]/50'
                      : 'bg-white/5 text-[#558187] border border-white/10'
                  }`}
                >
                  {active ? <Check size={10} className="stroke-[3]" /> : '•'}
                </span>
                <span>{item.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
