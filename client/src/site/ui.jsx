import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { cx } from './utils';

export function Container({ as: Tag = 'div', className, children, ...rest }) {
  return <Tag className={cx('mx-auto w-full max-w-[1240px]', className)} {...rest}>{children}</Tag>;
}

export function Eyebrow({ children, tone = 'leaf', className }) {
  const color = { leaf: 'text-osf-leaf', mint: 'text-osf-mint', muted: 'text-osf-muted' }[tone];
  return <span className={cx('font-osf-mono text-[13px] font-bold tracking-[0.1em]', color, className)}>{children}</span>;
}

export function GradientText({ children }) {
  return <span className="osf-gradient-text">{children}</span>;
}

const tagStyles = {
  soft: 'bg-osf-leaf-soft text-osf-leaf',
  dark: 'bg-osf-ink text-white',
  outline: 'border border-osf-line-strong text-osf-muted',
  mint: 'bg-osf-mint text-osf-ink',
  outlineDark: 'border border-osf-slate text-osf-fog',
  muted: 'bg-osf-mist text-osf-muted',
  sky: 'bg-osf-sky-soft text-osf-sky-dark',
  leaf: 'bg-osf-leaf text-white'
};
export function Tag({ variant = 'soft', className, children }) {
  return <span className={cx('inline-block rounded-full px-2.5 py-1.5 font-osf-mono text-[11px] font-bold leading-none tracking-[0.08em]', tagStyles[variant], className)}>{children}</span>;
}

const buttonStyles = {
  primary: 'bg-osf-leaf text-white border-osf-leaf hover:bg-osf-leaf-dark hover:border-osf-leaf-dark',
  outline: 'border-osf-line-strong text-osf-ink bg-transparent hover:border-osf-ink',
  frost: 'border-osf-line-strong text-osf-ink bg-white/80 hover:bg-white',
  light: 'bg-white text-osf-ink border-white hover:bg-osf-mist',
  ghostDark: 'border-osf-slate-2 text-white bg-transparent hover:border-white',
  outlineDark: 'border-osf-slate text-white bg-transparent hover:border-white'
};
const buttonSizes = {
  sm: 'text-[12px] px-5 py-3.5',
  md: 'text-[13px] px-6 py-4',
  lg: 'text-[13px] px-7 py-[18px]'
};
// One pill button that renders as a router Link, an external anchor or a <button>.
export function Button({ to, href, variant = 'primary', size = 'md', block, className, children, ...rest }) {
  const classes = cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-full border text-center font-osf-mono font-bold tracking-[0.08em] no-underline transition-colors', buttonStyles[variant], buttonSizes[size], block && 'w-full', className);
  if (to) return <Link to={to} className={classes} {...rest}>{children}</Link>;
  if (href) return <a href={href} className={classes} {...rest}>{children}</a>;
  return <button type="button" className={cx(classes, 'cursor-pointer')} {...rest}>{children}</button>;
}

export function ArrowLink({ to, children, className }) {
  return <Link to={to} className={cx('osf-link inline-block py-3.5 font-osf-mono text-[13px] font-bold tracking-[0.08em] no-underline', className)}>{children}</Link>;
}

export function SectionHeading({ eyebrow, title, intro, action, size = 'lg', className }) {
  const titleSize = size === 'lg' ? 'text-[clamp(36px,4.4vw,56px)]' : 'text-[clamp(32px,3.6vw,48px)]';
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-5', className)}>
      <div className="flex max-w-[760px] flex-col gap-3.5">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className={cx('m-0 font-semibold leading-[1.05] tracking-[-0.02em]', titleSize)}>{title}</h2>
        {intro && <p className="m-0 text-lg leading-[1.55] text-osf-muted">{intro}</p>}
      </div>
      {action}
    </div>
  );
}

export function DateBadge({ day, mon, size = 'md', className }) {
  const sizes = {
    sm: ['h-12 w-12 rounded-[10px]', 'text-lg', 'text-[10px]'],
    md: ['h-[68px] w-16 rounded-[14px]', 'text-[26px]', 'text-[10px]'],
    lg: ['h-[104px] w-24 rounded-2xl', 'text-[40px]', 'text-xs'],
    xl: ['h-[120px] w-28 rounded-[18px]', 'text-5xl', 'text-[13px]']
  }[size];
  return (
    <span className={cx('flex flex-none flex-col items-center justify-center gap-1 bg-osf-leaf leading-none text-white', sizes[0], className)}>
      <span className={cx('font-bold', sizes[1])}>{day}</span>
      <span className={cx('font-osf-mono tracking-[0.1em]', sizes[2])}>{mon}</span>
    </span>
  );
}

const avatarTones = {
  leaf: 'bg-osf-leaf-soft text-osf-leaf',
  sky: 'bg-osf-sky-soft text-osf-sky-dark',
  solid: 'bg-osf-leaf text-white',
  gradient: 'bg-linear-135 from-osf-leaf to-osf-sky text-white'
};
export function Avatar({ initials, tone = 'leaf', className }) {
  return <span aria-hidden="true" className={cx('flex flex-none items-center justify-center rounded-full font-bold', avatarTones[tone], className)}>{initials}</span>;
}

// Speaker photo from the speakers record; the design's initials tile when there is no photo.
export function SpeakerAvatar({ speaker, tone, className }) {
  if (speaker.photo) return <img src={speaker.photo} alt="" loading="lazy" className={cx('flex-none rounded-full object-cover', className)} />;
  return <Avatar initials={speaker.initials} tone={tone} className={className} />;
}

// Neutral placeholder while data loads or when the API is unreachable.
export function DataState({ loading, error, className }) {
  if (!loading && !error) return null;
  return <p role={error ? 'alert' : 'status'} className={cx('m-0 rounded-2xl border border-osf-line bg-white p-5 text-[15px] text-osf-muted', className)}>{error ? `We couldn't load the latest episodes. Please refresh in a moment.` : 'Loading…'}</p>;
}

// Toggle pill used for domain filters (dark when pressed) and multi-select chips (green with a tick).
export function ToggleChip({ pressed, onClick, variant = 'filter', children, className }) {
  const on = variant === 'filter' ? 'border-osf-ink bg-osf-ink text-white font-bold' : 'border-osf-leaf bg-osf-leaf text-white font-bold';
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick}
      className={cx('inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 py-3 font-osf-mono text-xs tracking-[0.08em] transition-colors', pressed ? on : 'border-osf-line-strong bg-white font-medium text-osf-ink hover:border-osf-ink', className)}>
      {pressed && variant === 'check' && <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />}
      {children}
    </button>
  );
}

export function Card({ as: Tag = 'div', className, children, ...rest }) {
  return <Tag className={cx('rounded-3xl border border-osf-line bg-white', className)} {...rest}>{children}</Tag>;
}

export function Field({ id, label, required, hint, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-[15px] font-semibold">{label}{required && <span className="text-osf-danger"> *</span>}</label>
      {children}
      {hint}
    </div>
  );
}

export function StepProgress({ current }) {
  const steps = ['IDENTIFY', 'DETAILS', 'DONE'];
  return (
    <ol aria-label="Registration progress" className="m-0 grid list-none grid-cols-3 gap-2 p-0">
      {steps.map((label, i) => {
        const reached = i <= current;
        return (
          <li key={label} aria-current={i === current ? 'step' : undefined} className="flex min-w-0 flex-col gap-2">
            <span className={cx('h-1.5 rounded-full', reached ? 'bg-osf-leaf' : 'bg-osf-line')} />
            <span className={cx('font-osf-mono text-[10px] tracking-[0.04em] sm:text-[11px] sm:tracking-[0.08em]', reached ? 'font-bold text-osf-leaf' : 'font-medium text-osf-muted')}>
              0{i + 1} · {label}{i < current ? ' ✓' : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Terminal({ title, dark, children, footer, className }) {
  return (
    <div className={cx('min-w-0 overflow-hidden rounded-[20px] border', dark ? 'border-[#2E5568] bg-white/[0.06]' : 'border-osf-line bg-white/[0.92] shadow-[0_24px_60px_-24px_rgba(16,34,43,0.25)]', className)}>
      <div className={cx('flex items-center gap-2 border-b px-[18px] py-3.5', dark ? 'border-[#2E5568]' : 'border-osf-line')}>
        {[0, 1, 2].map((i) => <span key={i} className={cx('h-2.5 w-2.5 rounded-full', dark ? 'bg-osf-slate-2' : 'bg-osf-line')} />)}
        <span className={cx('ml-2 truncate font-osf-mono text-xs', dark ? 'text-osf-faint' : 'text-osf-muted')}>{title}</span>
      </div>
      {children}
      {footer}
    </div>
  );
}
