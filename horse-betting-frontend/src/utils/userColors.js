// Player colours = the validated categorical chart palette (colourblind-checked, fixed
// order), so a player's avatar and their line in the charts always match.
export const SERIES_HEX = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

// Literal class names so Tailwind generates them
export const BADGE_COLOURS = [
  'bg-[#2a78d6]', 'bg-[#eb6834]', 'bg-[#1baf7a]', 'bg-[#eda100]',
  'bg-[#e87ba4]', 'bg-[#008300]', 'bg-[#4a3aa7]', 'bg-[#e34948]',
];

export const initials = (name) => (name || '').trim().slice(0, 2).toUpperCase();

const colourIndex = (users, userId) => {
  const index = users.findIndex(u => String(u.id) === String(userId));
  return index >= 0 ? index % BADGE_COLOURS.length : 0;
};

export const getUserColour = (users, userId) => BADGE_COLOURS[colourIndex(users, userId)];
export const getUserHex = (users, userId) => SERIES_HEX[colourIndex(users, userId)];

export const AVATARS = ['🐴', '🦄', '🏇', '🐎', '🦓', '🐢', '🦊', '🐯', '🦁', '🐼', '🐸', '🐙',
  '🦖', '🐝', '🦜', '🐬', '👑', '🍀', '🌟', '🔥', '🎩', '🌈', '🍍', '🥥'];
