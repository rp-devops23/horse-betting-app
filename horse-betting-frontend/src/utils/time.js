import { useEffect, useState } from 'react';

// Re-renders every `interval` ms; returns the current time.
export const useNow = (interval = 30000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
};

export const raceStart = (race) => (race?.startsAt ? new Date(race.startsAt).getTime() : null);

export const isRaceLocked = (race, now = Date.now()) => {
  if (!race) return false;
  if (race.locked || race.status === 'completed' || race.winner != null) return true;
  const start = raceStart(race);
  return start != null && now >= start;
};

export const formatCountdown = (ms) => {
  if (ms <= 0) return 'maintenant';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "moins d'1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
  const days = Math.floor(hours / 24);
  return `${days} jour${days > 1 ? 's' : ''}`;
};

const parseDate = (date) => new Date(`${date}T12:00:00`);

export const formatDay = (date, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  date ? parseDate(date).toLocaleDateString('fr-FR', opts) : '';

// "Aujourd'hui", "Demain", "Hier" or a short date
export const relativeDay = (date) => {
  if (!date) return '';
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shift = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
  if (date === shift(0)) return "Aujourd'hui";
  if (date === shift(1)) return 'Demain';
  if (date === shift(-1)) return 'Hier';
  return formatDay(date);
};
