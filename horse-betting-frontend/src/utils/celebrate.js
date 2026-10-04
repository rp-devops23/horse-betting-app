import confetti from 'canvas-confetti';

const COLOURS = ['#8247F5', '#FFD54A', '#FF6B74', '#33C98F', '#3DB4F5'];
const SEEN_KEY = 'lekours.celebrated';

export const celebrate = (big = false) => {
  confetti({ particleCount: big ? 160 : 80, spread: big ? 100 : 70, origin: { y: 0.7 }, colors: COLOURS, disableForReducedMotion: true });
  if (big) {
    setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0, y: 0.8 }, colors: COLOURS, disableForReducedMotion: true }), 200);
    setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1, y: 0.8 }, colors: COLOURS, disableForReducedMotion: true }), 350);
  }
};

export const starBurst = () =>
  confetti({ particleCount: 40, spread: 50, shapes: ['star'], colors: ['#FFD54A', '#FFC21A'], origin: { y: 0.6 }, scalar: 1.2, disableForReducedMotion: true });

// Remember which wins were already celebrated so confetti only fires once.
export const markCelebrated = (key) => {
  try {
    const seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
    if (seen.has(key)) return false;
    seen.add(key);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
    return true;
  } catch {
    return false;
  }
};
