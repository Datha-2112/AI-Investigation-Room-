export function sanitizeStorySeed(value) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
