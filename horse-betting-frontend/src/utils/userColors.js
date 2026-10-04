export const BADGE_COLOURS = [
  'bg-coral-400',
  'bg-grape-500',
  'bg-sky2-400',
  'bg-mint-400',
  'bg-sunny-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-orange-500',
];

export const initials = (name) => (name || '').trim().slice(0, 2).toUpperCase();

export const getUserColour = (users, userId) => {
  const index = users.findIndex(u => String(u.id) === String(userId));
  return BADGE_COLOURS[index >= 0 ? index % BADGE_COLOURS.length : 0];
};

export const AVATARS = ['🐴', '🦄', '🏇', '🐎', '🦓', '🐢', '🦊', '🐯', '🦁', '🐼', '🐸', '🐙',
  '🦖', '🐝', '🦜', '🐬', '👑', '🍀', '🌟', '🔥', '🎩', '🌈', '🍍', '🥥'];
