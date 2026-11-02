import { createContext, createElement, useContext, useEffect, useState } from 'react';
import { calendarDay, isEpisodeConcluded, isRegistrationOpen } from '../utils/episodeTime';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// API paths for images are relative to the API host.
const absolute = (url) => (url && url.startsWith('/') ? `${API_URL}${url}` : url || null);

export const DOMAIN_LABELS = { ai_engineer: 'AI ENGINEER', cloud_computing: 'CLOUD COMPUTING', open_source: 'OPEN SOURCE', digital_skills: 'DIGITAL SKILLS' };

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "7:00 PM - 8:00 PM" -> { label: "7:00 – 8:00 PM IST", clock24: "19:00 – 20:00 IST" }. All OSF times are IST.
function times(eventTime) {
  const parts = String(eventTime || '').split(/\s*[-–]\s*/).map((p) => p.trim()).filter(Boolean);
  const to24 = (t) => {
    const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!m) return null;
    let h = Number(m[1]);
    if (m[3]) h = (h % 12) + (/PM/i.test(m[3]) ? 12 : 0);
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  };
  const meridiem = parts.map((t) => (t.match(/(AM|PM)$/i) || [])[1]?.toUpperCase());
  const label = parts.length === 2 && meridiem[0] && meridiem[0] === meridiem[1]
    ? `${parts[0].replace(/\s*(AM|PM)$/i, '')} – ${parts[1]} IST`
    : `${parts.join(' – ')} IST`;
  const clock = parts.map(to24);
  // "7:00 PM" -> "7 PM", "7:30 PM" -> "7:30 PM"
  const start = parts[0] ? `${parts[0].replace(/\s*(AM|PM)$/i, '').replace(/:00$/, '')} ${meridiem[0] || meridiem[1] || ''}`.trim() : null;
  return { label: parts.length ? label : null, clock24: clock.every(Boolean) ? `${clock.join(' – ')} IST` : null, start, start24: clock[0] || null };
}

const initials = (name) => name.replace(/^(mr|mrs|ms|dr|prof)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// Academic titles are part of how speakers are introduced; Mr./Ms. are kept for the register panel only.
export function speakerView(s) {
  const honorific = s.honorific || null;
  const name = s.name;
  return {
    id: s.id,
    name: honorific && /^(dr|prof)\.?$/i.test(honorific) ? `${honorific} ${name}` : name,
    fullName: honorific ? `${honorific} ${name}` : name,
    initials: initials(name),
    designation: s.designation || null,
    company: s.company || null,
    role: [s.designation, s.company].filter(Boolean).join(', ') || null,
    bio: s.bio || null,
    linkedin: s.linkedin_url || null,
    photo: absolute(s.photo_url),
    domains: (s.domains || []).map((d) => DOMAIN_LABELS[d]).filter(Boolean),
  };
}

export function episodeView(e, now = Date.now()) {
  const day = calendarDay(e.event_date);
  const date = new Date(`${day}T00:00:00Z`);
  const valid = !Number.isNaN(date.getTime());
  const t = times(e.event_time);
  return {
    id: e.id,
    num: e.episode_number,
    title: e.title,
    blurb: e.short_blurb || null,
    description: e.description || null,
    agenda: e.agenda || [],
    domain: DOMAIN_LABELS[e.domain] || null,
    isoDay: day,
    day: valid ? String(date.getUTCDate()).padStart(2, '0') : '',
    mon: valid ? MONTHS[date.getUTCMonth()] : '',
    weekday: valid ? WEEKDAYS[date.getUTCDay()] : '',
    dateLong: valid ? `${WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()][0]}${MONTHS[date.getUTCMonth()].slice(1).toLowerCase()} ${date.getUTCFullYear()}` : '',
    time: t.label,
    time24: t.clock24,
    timeShort: t.label ? t.label.replace(/:00/g, '').replace(' – ', '–') : null,
    start: t.start,
    start24: t.start24,
    mode: e.event_mode || 'Online',
    upcoming: !isEpisodeConcluded(e, now),
    registrationOpen: isRegistrationOpen(e, now),
    isTest: e.is_test === true,
    cover: absolute(e.cover_url),
    speakers: (e.speakers || []).map(speakerView),
    registerPath: `/register/episode-${e.episode_number}`,
  };
}

async function getJson(path) {
  const res = await fetch(`${API_URL}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.error || 'Could not load data.');
  return data;
}

const SiteData = createContext(null);

// Loads the public data once per visit. Every number and name on the site comes from here.
export function SiteDataProvider({ children }) {
  const [state, setState] = useState({ loading: true, error: null, episodes: [], speakers: [], stats: null });
  useEffect(() => {
    let alive = true;
    Promise.all([getJson('/api/v2/episodes'), getJson('/api/speakers'), getJson('/api/stats')])
      .then(([e, s, st]) => {
        if (!alive) return;
        const now = Date.now();
        // Test events stay out of the public site in production builds.
        const episodes = e.episodes.map((x) => episodeView(x, now)).filter((x) => !x.isTest || import.meta.env.DEV || import.meta.env.VITE_SHOW_TEST_EVENTS === 'true');
        const speakers = s.speakers.map((x) => ({ ...speakerView(x), episodes: x.episodes, episodeCount: x.episode_count, isRepeat: x.is_repeat }));
        setState({ loading: false, error: null, episodes, speakers, stats: st.stats });
      })
      .catch((err) => alive && setState((prev) => ({ ...prev, loading: false, error: err.message })));
    return () => { alive = false; };
  }, []);
  return createElement(SiteData.Provider, { value: state }, children);
}

export function useSiteData() {
  const data = useContext(SiteData);
  const upcoming = data.episodes.filter((e) => e.upcoming).sort((a, b) => a.num - b.num);
  const past = data.episodes.filter((e) => !e.upcoming).sort((a, b) => b.num - a.num);
  return {
    ...data,
    upcoming,
    past,
    next: upcoming[0] || null,
    byNumber: (n) => data.episodes.find((e) => e.num === Number(n)) || null,
    clubStats: data.stats?.club_stats || [],
  };
}

export async function postJson(path, body) {
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
