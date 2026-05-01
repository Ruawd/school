export const resolveImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  const normalized = url.replace(/\\/g, '/');
  const match = normalized.match(/\/uploads\/.*$/);
  if (match) return match[0];

  if (normalized.includes('uploads/')) {
    return `/uploads/${normalized.split('uploads/')[1]}`;
  }

  if (normalized.startsWith('http')) return normalized;
  return normalized;
};
