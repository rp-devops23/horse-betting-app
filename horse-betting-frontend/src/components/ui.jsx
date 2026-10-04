import React, { useEffect } from 'react';
import { X, Delete } from 'lucide-react';
import { initials, getUserColour } from '../utils/userColors';

const AVATAR_SIZES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
  xl: 'w-24 h-24 text-4xl',
};
const EMOJI_SIZES = { xs: 'text-sm', sm: 'text-base', md: 'text-xl', lg: 'text-3xl', xl: 'text-6xl' };

export const Avatar = ({ user, users = [], size = 'md', className = '', title }) => {
  const colour = getUserColour(users, user?.id);
  return (
    <span
      title={title ?? user?.name}
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full font-display font-extrabold text-white
        border-2 border-white shadow-sm ${colour} ${AVATAR_SIZES[size]} ${className}`}
    >
      {user?.avatar
        ? <span className={`${EMOJI_SIZES[size]} leading-none`}>{user.avatar}</span>
        : initials(user?.name)}
    </span>
  );
};

export const Spinner = ({ className = 'w-5 h-5' }) => (
  <span className={`inline-block animate-spin rounded-full border-[3px] border-current border-t-transparent ${className}`} />
);

export const GallopLoader = ({ label = 'Chargement…' }) => (
  <div className="py-12 flex flex-col items-center gap-3 text-grape-400">
    <div className="relative w-48 h-10 overflow-hidden rounded-full bg-grape-50 border-2 border-grape-100">
      <span className="absolute top-1 text-2xl animate-gallop" style={{ transform: 'scaleX(-1)' }}>🏇</span>
    </div>
    <p className="font-display font-bold">{label}</p>
  </div>
);

export const EmptyState = ({ emoji = '🐴', title, children }) => (
  <div className="py-12 px-6 text-center">
    <div className="text-6xl mb-3 animate-float inline-block">{emoji}</div>
    <p className="font-display text-xl font-extrabold text-grape-800">{title}</p>
    {children && <div className="mt-1 text-grape-500">{children}</div>}
  </div>
);

export const Modal = ({ open, onClose, children, className = '' }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-grape-900/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className={`relative w-full sm:max-w-sm bg-white rounded-t-[2rem] sm:rounded-[2rem] p-6 pb-8 shadow-pop animate-slide-up ${className}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {onClose && (
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full text-grape-300 hover:bg-grape-50 hover:text-grape-600" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
};

// Big friendly keypad for 4-digit PINs
export const PinPad = ({ value, onChange, onSubmit, shake = false, busy = false }) => {
  useEffect(() => {
    const onKey = (e) => {
      if (busy) return;
      if (/^\d$/.test(e.key) && value.length < 4) onChange(value + e.key);
      else if (e.key === 'Backspace') onChange(value.slice(0, -1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [value, onChange, busy]);

  // Submit as soon as the 4th digit is entered

  useEffect(() => {
    if (value.length === 4) onSubmit();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const press = (d) => !busy && value.length < 4 && onChange(value + d);
  return (
    <div>
      <div className={`flex justify-center gap-3 mb-6 ${shake ? 'animate-shake' : ''}`}>
        {[0, 1, 2, 3].map(i => (
          <span key={i} className={`w-4 h-4 rounded-full transition-all ${i < value.length ? 'bg-grape-500 scale-110' : 'bg-grape-100'} ${busy ? 'animate-pulse' : ''}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button key={d} type="button" onClick={() => press(d)} className="btn-ghost h-14 text-2xl">{d}</button>
        ))}
        <span />
        <button type="button" onClick={() => press('0')} className="btn-ghost h-14 text-2xl">0</button>
        <button type="button" onClick={() => onChange(value.slice(0, -1))} className="btn h-14 text-grape-400 hover:bg-grape-50" aria-label="Effacer">
          <Delete className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

export const StatTile = ({ emoji, label, value, sub, tone = 'grape' }) => {
  const tones = {
    grape: 'bg-grape-50 border-grape-100',
    sunny: 'bg-sunny-100 border-sunny-200',
    mint: 'bg-mint-100 border-mint-200',
    coral: 'bg-coral-100 border-coral-200',
    sky: 'bg-sky2-100 border-sky2-200',
  };
  return (
    <div className={`rounded-2xl border-2 p-3 ${tones[tone]}`}>
      <div className="text-xs font-bold uppercase tracking-wide text-grape-500 flex items-center gap-1">
        <span className="text-base">{emoji}</span>{label}
      </div>
      <div className="font-display text-2xl font-extrabold text-grape-900 leading-tight mt-0.5">{value}</div>
      {sub && <div className="text-xs text-grape-500 truncate">{sub}</div>}
    </div>
  );
};

export const ProgressBar = ({ value, max, className = 'bg-grape-400' }) => (
  <div className="h-2.5 rounded-full bg-grape-100 overflow-hidden">
    <div className={`h-full rounded-full transition-all duration-500 ${className}`} style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} />
  </div>
);

export const Segmented = ({ options, value, onChange }) => (
  <div className="inline-flex rounded-2xl bg-grape-50 p-1 border-2 border-grape-100">
    {options.map(o => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={`px-3 py-1.5 rounded-xl text-sm font-display font-bold transition-all ${
          value === o.value ? 'bg-white text-grape-700 shadow-chunky' : 'text-grape-400 hover:text-grape-600'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const MEDALS = ['🥇', '🥈', '🥉'];
