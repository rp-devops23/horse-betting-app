export const BADGE_COLOURS = [
  'bg-pink-500',
  'bg-violet-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-orange-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-amber-500',
];

export const initials = (name) => name.trim().slice(0, 2).toUpperCase();

export const getUserColour = (users, userId) => {
  const index = users.findIndex(u => String(u.id) === String(userId));
  return BADGE_COLOURS[index >= 0 ? index % BADGE_COLOURS.length : 0];
};
