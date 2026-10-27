export const LOCAL_KEY = 'daria-client-review-14-v1';
export const LOGIN_KEY = 'daria-client-review-14-login-v1';
export const BACKEND = 'https://daria-web-preview.up.railway.app';
const noncePattern = /^[A-Za-z0-9_-]{24,160}$/;
const codePattern = /^[A-Za-z0-9_-]{43}$/;

export function cleanVotes(input, ids) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const allowed = new Set(ids);
  return Object.fromEntries(Object.entries(input).filter(([id,value]) => allowed.has(id) && ['yes','no'].includes(value)));
}

export function readLocal(storage, ids) {
  try {
    const data = JSON.parse(storage.getItem(LOCAL_KEY) || 'null');
    return {votes:cleanVotes(data?.votes,ids),current:ids.includes(data?.current) ? data.current : ids[0],view:data?.view==='site'?'site':'designs'};
  } catch { return {votes:{},current:ids[0],view:'designs'}; }
}

export function makeLogin(session, current, nonce, now=Date.now()) {
  if (!noncePattern.test(nonce)) throw Error('Не удалось подготовить безопасный вход. Обновите страницу.');
  const pending=JSON.stringify({nonce,current,createdAt:now});
  session.setItem(LOGIN_KEY,pending);
  if (session.getItem(LOGIN_KEY)!==pending) throw Error('Браузер не сохраняет данные входа. Разрешите хранение данных для этого сайта.');
  return BACKEND+'/daria-review/connect/?state='+encodeURIComponent(nonce);
}

export function consumeCallback(hash, session, ids, now=Date.now()) {
  const params = new URLSearchParams(hash.replace(/^#/,''));
  if (!params.has('connect')) return null;
  const code=params.get('connect'),state=params.get('state');
  let pending;
  try { pending=JSON.parse(session.getItem(LOGIN_KEY)||'null'); session.removeItem(LOGIN_KEY); }
  catch { throw Error('Не удалось восстановить вход. Ваши оценки остаются в этом браузере. Войдите ещё раз.'); }
  if (!codePattern.test(code||'') || !noncePattern.test(state||'') || !pending || pending.nonce!==state || !Number.isFinite(pending.createdAt) || now-pending.createdAt>10*60*1000 || now<pending.createdAt) {
    throw Error('Ссылка входа устарела. Ваши оценки остаются в этом браузере. Войдите ещё раз.');
  }
  return {code,state,current:ids.includes(pending.current)?pending.current:ids[0]};
}
