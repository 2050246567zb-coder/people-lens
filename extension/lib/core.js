export const VERSION = 3;
export const MODES = { recent: '最近', earliest: '最早', mixed: '混合' };
export const DEFAULTS = Object.freeze({
  enabled: true, autoAnalyze: true, endpoint: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat',
  mode: 'recent', count: 10, mix: [1, 1, 1], contentMode: 'text', imageLimit: 3,
  summaryLength: 180, prompt: '', budgetSeconds: 15, cacheHours: 6,
  maxOutputTokens: 4096, generationMode: 'fast',
  localConcurrency: 3,
});
const clamp = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : fallback;
export function settingsOf(raw = {}) {
  const s = { ...DEFAULTS, ...raw };
  s.enabled = raw.enabled !== false; s.autoAnalyze = raw.autoAnalyze !== false;
  s.mode = Object.hasOwn(MODES, s.mode) ? s.mode : 'recent';
  s.count = clamp(s.count, 1, 50, 10); s.summaryLength = clamp(s.summaryLength, 60, 500, 180);
  s.budgetSeconds = clamp(s.budgetSeconds, 5, 45, 15); s.cacheHours = clamp(s.cacheHours, 1, 72, 6);
  s.imageLimit = clamp(s.imageLimit, 1, 6, 3); s.contentMode = s.contentMode === 'vision' ? 'vision' : 'text';
  s.maxOutputTokens = clamp(s.maxOutputTokens === '' ? 4096 : s.maxOutputTokens, 256, 32768, 4096);
  s.generationMode = s.generationMode === 'default' ? 'default' : 'fast';
  s.localConcurrency = clamp(s.localConcurrency, 1, 5, 3);
  s.mix = Array.isArray(s.mix) && s.mix.length === 3 ? s.mix.map(v => clamp(v, 0, 100, 1)) : [1, 1, 1];
  if (!s.mix.some(Boolean)) s.mix = [1, 1, 1];
  for (const k of ['endpoint', 'apiKey', 'model', 'prompt']) s[k] = String(s[k] ?? '').trim().slice(0, k === 'prompt' ? 5000 : 2048);
  return s;
}
export function endpointOf(input) {
  const u = new URL(String(input).trim());
  if (u.username || u.password || u.search || u.hash) throw new Error('API 地址不能包含密码、查询参数或片段。');
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Error('API 请使用 HTTPS；本地模型可使用 localhost 或 127.0.0.1。');
  u.pathname = u.pathname.replace(/\/+$/, '');
  if (!u.pathname.endsWith('/chat/completions')) u.pathname += '/chat/completions';
  return u.toString();
}
export function targetOf(raw) {
  const id = String(raw?.id ?? '').trim();
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error('未识别到有效的小红书用户 ID。');
  const u = new URL(raw?.url || `https://www.xiaohongshu.com/user/profile/${id}`);
  if (u.origin !== 'https://www.xiaohongshu.com' || u.pathname.replace(/\/$/,'') !== `/user/profile/${id}`) throw new Error('主页地址与回复对象不一致。');
  const url = new URL(u.origin + `/user/profile/${id}`);
  for (const k of ['xsec_token', 'xsec_source']) if (u.searchParams.has(k)) url.searchParams.set(k, u.searchParams.get(k).slice(0, 2048));
  return { platform: 'xiaohongshu', id, name: String(raw.name || '这位用户').slice(0, 80), url: url.href, avatar:avatarURL(raw.avatar) };
}
export function parseInitialState(html) {
  const match = String(html).match(/(?:window\.)?__INITIAL_STATE__\s*=\s*/);
  if (!match) throw new Error('页面未提供可读取的公开数据。');
  const source = html.slice(match.index + match[0].length);
  let depth = 0, quoted = false, escaped = false, end = -1;
  if (source[0] !== '{') throw new Error('页面数据格式已改变。');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') quoted = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { if (--depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('页面数据不完整。');
  // Only replace the JavaScript token, never text inside a JSON string. No eval/Function.
  const json = source.slice(0, end).replace(/"(?:\\.|[^"\\])*"|\bundefined\b/g, m => m === 'undefined' ? 'null' : m);
  return JSON.parse(json);
}
export const unwrap = v => v?._value ?? v?.value ?? v;
export function timestamp(v) {
  const n = Number(v); if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  const t = Date.parse(v); return Number.isFinite(t) ? t : null;
}
function imageURL(input) {
  try { const u = new URL(input); if (u.hostname.endsWith('.xhscdn.com')) { u.protocol = 'https:'; return u.href; } } catch {} return '';
}
export function avatarURL(input) {
  if(typeof input!=='string' || input.length>4096)return '';
  try {const u=new URL(input,'https://www.xiaohongshu.com');
    if(u.protocol==='https:' && u.hostname.endsWith('.xhscdn.com') && !u.username && !u.password)return u.href;
  }catch{}return '';
}
export function noteOf(entry, userId) {
  const n = entry?.noteCard ?? entry?.note_card ?? entry;
  const id = String(n?.noteId ?? n?.note_id ?? entry?.id ?? '');
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  const authorId = String(n.user?.userId ?? n.user?.user_id ?? userId);
  if (authorId !== userId) return null;
  const url = new URL(`https://www.xiaohongshu.com/explore/${id}`);
  const token = entry.xsecToken ?? entry.xsec_token ?? n.xsecToken ?? n.xsec_token;
  if (token) { url.searchParams.set('xsec_token', String(token)); url.searchParams.set('xsec_source', 'pc_user'); }
  const images = (n.imageList || []).map(i => imageURL(i.urlDefault || i.url || i.infoList?.find(x => x.imageScene === 'WB_DFT')?.url || i.infoList?.[0]?.url)).filter(Boolean);
  const cover = imageURL(n.cover?.urlDefault || n.cover?.urlPre || n.cover?.url);
  return { id, authorId, title: String(n.title ?? n.displayTitle ?? n.display_title ?? '').slice(0, 500),
    text: String(n.desc ?? '').slice(0, 6000), time: timestamp(n.time ?? n.publishTime), type: n.type || 'normal',
    pinned: Boolean(n.interactInfo?.sticky), url: url.href, images: images.length ? images : cover ? [cover] : [], full: typeof n.desc === 'string' };
}
export function profileOf(user, target) {
  const p = unwrap(user?.userPageData) || user?.pageData;
  if (!p?.basicInfo) throw new Error('未取得对方主页，可能需要登录或该主页不可访问。');
  const b = p.basicInfo;
  const groups = unwrap(user?.notes) || user?.noteGroups || [];
  // Only posted tab, never favorites/liked tabs.
  const posted = Array.isArray(groups[0]) ? groups[0] : groups;
  const notes = uniqueNotes(posted.map(e => noteOf(e, target.id)).filter(Boolean));
  const total = p.posted !== null && p.posted !== undefined && p.posted !== '' && Number.isFinite(Number(p.posted)) ? Number(p.posted) : null;
  return { profile: { id: target.id, name: String(b.nickname || target.name).slice(0, 80), bio: String(b.desc || '').slice(0, 2000), avatar:avatarURL(b.images||b.imageb)||avatarURL(target.avatar),
    tags: (p.tags || []).map(t => String(t.name || '').slice(0, 100)).filter(Boolean).slice(0, 10), url: target.url }, notes, total,
    complete: total !== null && notes.length >= total, fetchedAt: Date.now(), warnings: [] };
}
export function uniqueNotes(notes) {
  const map = new Map(); for (const n of notes) { const old = map.get(n.id); if (!old || n.full || !old.full) map.set(n.id, { ...old, ...n }); } return [...map.values()];
}
export function sampleNotes(notes, mode, count, mix = [1,1,1]) {
  const all = uniqueNotes(notes); const dated = all.filter(n => n.time);
  const list = (dated.length ? dated : all).toSorted((a,b) => (a.time || 0) - (b.time || 0));
  const n = Math.min(count, list.length); if (!n) return [];
  if (mode === 'earliest') return list.slice(0, n);
  if (mode !== 'mixed') return dated.length ? list.slice(-n).reverse() : list.slice(0, n);
  // Three chronological zones; distribute X total by largest remainder.
  const total = mix.reduce((a,b) => a+b, 0) || 3;
  const exact = mix.map(w => n*w/total), quotas = exact.map(Math.floor);
  const order = exact.map((v,i) => ({ i, f: v - quotas[i] })).sort((a,b) => b.f-a.f || a.i-b.i);
  for (let i=0; quotas.reduce((a,b)=>a+b,0)<n; i++) quotas[order[i%3].i]++;
  const used = new Set(), selected = [];
  const centers = [0, Math.floor((list.length-1)/2), list.length-1];
  for (let zone=0; zone<3; zone++) {
    const candidates = list.map((item,i)=>({item,i,d:Math.abs(i-centers[zone])})).sort((a,b)=>a.d-b.d || a.i-b.i);
    for (const {item} of candidates) if (!used.has(item.id) && quotas[zone]>0) { used.add(item.id); selected.push(item); quotas[zone]--; }
  }
  return selected.sort((a,b)=>(a.time||0)-(b.time||0));
}
export async function cacheKey(target, settings) {
  const data = JSON.stringify({ version: VERSION, platform: target.platform, id: target.id, ...settings });
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function coverageOf(data, selected, settings) {
  const warnings = [...(data.warnings || [])];
  if (!data.complete && settings.mode !== 'recent') warnings.push('未遍历完整个公开列表；最早／中间仅指本次已取得的内容。');
  if (data.notes.some(n=>!n.time)) warnings.push('部分笔记没有可核实的发布时间，时间抽样覆盖可能不完整。');
  const full = selected.filter(n=>n.full).length;
  if (full < selected.length) warnings.push(`${selected.length-full} 条未取得正文，只能参考标题；介绍中的结论会受此限制。`);
  if (selected.length < settings.count) warnings.push(`请求 ${settings.count} 条，本次取得 ${selected.length} 条。`);
  return { requested: settings.count, sampled: selected.length, full, scanned: data.notes.length, total: data.total, complete: data.complete,
    scope: !data.complete && settings.mode !== 'recent' ? '已取得内容中的' : '', mode: settings.mode, warnings: [...new Set(warnings)] };
}
