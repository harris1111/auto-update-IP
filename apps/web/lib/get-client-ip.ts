export function getClientIP(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip');
  if (cf && cf !== '::1' && cf !== '127.0.0.1') return cf;

  const xReal = headers.get('x-real-ip');
  if (xReal && xReal !== '127.0.0.1') return xReal;

  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first && first !== '127.0.0.1') return first;
  }

  return '127.0.0.1';
}
