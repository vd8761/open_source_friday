// Small helpers shared by the OSF site components.
export const cx = (...classes) => classes.filter(Boolean).join(' ');
export const asset = (file) => `${import.meta.env.BASE_URL}${file}`;

// Hero backgrounds: soft colour glows over the blueprint grid.
const glow = { leaf: '76,175,80', sky: '21,147,195' };
export function heroBackground(glows = []) {
  const layers = glows.map(([tone, at, alpha, reach = 30]) => `radial-gradient(circle at ${at}, rgba(${glow[tone]},${alpha}), transparent ${reach}%)`);
  return {
    backgroundImage: [...layers, 'linear-gradient(rgba(16,34,43,0.045) 1px, transparent 1px)', 'linear-gradient(90deg, rgba(16,34,43,0.045) 1px, transparent 1px)'].join(', '),
    backgroundSize: [...glows.map(() => '100% 100%'), '64px 64px', '64px 64px'].join(', ')
  };
}
