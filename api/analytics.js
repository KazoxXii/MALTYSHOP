const ALLOWED_ORIGINS = ['https://maltyshop.vercel.app', 'http://localhost:3000', 'http://localhost:5173'];

function getRedis() {
  let url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url) url = url.replace(/\/+$/, '');
  return { url, token };
}

async function rGet(key) {
  const { url, token } = getRedis();
  if (!url || !token) return null;
  try {
    const res = await fetch(url + '/get/' + encodeURIComponent(key), {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    if (data.result === null || data.result === undefined) return null;
    if (typeof data.result === 'string') {
      try { return JSON.parse(data.result); } catch(e) { return data.result; }
    }
    return data.result;
  } catch(e) { return null; }
}

async function rSet(key, value, ex) {
  const { url, token } = getRedis();
  if (!url || !token) return null;
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  try {
    let urlStr = url + '/set/' + encodeURIComponent(key);
    if (ex) urlStr += '?EX=' + ex;
    const res = await fetch(urlStr, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain' },
      body: serialized
    });
    return await res.json();
  } catch(e) { return null; }
}

async function rIncr(key) {
  const { url, token } = getRedis();
  if (!url || !token) return 0;
  try {
    const res = await fetch(url + '/incr/' + encodeURIComponent(key), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    return parseInt(data.result) || 0;
  } catch(e) { return 0; }
}

async function rHincrby(key, field, inc) {
  const { url, token } = getRedis();
  if (!url || !token) return;
  try {
    await fetch(url + '/hincrby/' + encodeURIComponent(key) + '/' + encodeURIComponent(field), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: String(inc)
    });
  } catch(e) {}
}

async function rHgetall(key) {
  const { url, token } = getRedis();
  if (!url || !token) return {};
  try {
    const res = await fetch(url + '/hgetall/' + encodeURIComponent(key), {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    if (!data.result) return {};
    const obj = {};
    const arr = data.result;
    for (let i = 0; i < arr.length; i += 2) {
      obj[arr[i]] = parseInt(arr[i + 1]) || 0;
    }
    return obj;
  } catch(e) { return {}; }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getUA(req) {
  return req.headers['user-agent'] || '';
}

function isBot(ua) {
  return /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|preview/i.test(ua);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, 'https://maltyshop.vercel.app');
  const action = url.searchParams.get('action') || req.body?.action;

  // ---- TRACK: Record a page view ----
  if (req.method === 'POST' && action === 'track') {
    const { page, referrer, screenWidth } = req.body || {};
    if (!page) return res.status(400).json({ error: 'page required' });

    const ua = getUA(req);
    if (isBot(ua)) return res.status(200).json({ ok: true, skipped: 'bot' });

    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    const d = today();
    const visitorId = ip + '_' + (ua.slice(0, 50));

    // Increment counters
    await Promise.all([
      rIncr('a:views:total'),
      rIncr('a:views:' + d),
      rHincrby('a:pages', page, 1),
      rHincrby('a:referrers', referrer || 'direct', 1),
      rHincrby('a:devices', screenWidth < 768 ? 'mobile' : screenWidth < 1024 ? 'tablet' : 'desktop', 1),
      rSet('a:vis:' + visitorId, '1', 86400)
    ]);

    // Track unique visitors per day
    const exists = await rGet('a:vis:' + visitorId);
    if (exists === '1') {
      // First visit today
    } else {
      await rIncr('a:visitors:' + d);
    }

    return res.status(200).json({ ok: true });
  }

  // ---- TRACK CLICK ----
  if (req.method === 'POST' && action === 'track-click') {
    const { element, page } = req.body || {};
    const d = today();
    await Promise.all([
      rIncr('a:clicks:total'),
      rIncr('a:clicks:' + d),
      rHincrby('a:click-elements', element || 'unknown', 1)
    ]);
    return res.status(200).json({ ok: true });
  }

  // ---- STATS: Get analytics data ----
  if (req.method === 'GET' && action === 'stats') {
    const d = today();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      days.push(dt.toISOString().slice(0, 10));
    }

    const [
      totalViews,
      totalClicks,
      todayViews,
      todayVisitors,
      pages,
      referrers,
      devices,
      clickElements
    ] = await Promise.all([
      rGet('a:views:total') || 0,
      rGet('a:clicks:total') || 0,
      rGet('a:views:' + d) || 0,
      rGet('a:visitors:' + d) || 0,
      rHgetall('a:pages'),
      rHgetall('a:referrers'),
      rHgetall('a:devices'),
      rHgetall('a:click-elements')
    ]);

    // Views per day for chart
    const viewsByDay = {};
    const clicksByDay = {};
    await Promise.all(days.map(async (day) => {
      viewsByDay[day] = parseInt(await rGet('a:views:' + day)) || 0;
      clicksByDay[day] = parseInt(await rGet('a:clicks:' + day)) || 0;
    }));

    // Top pages sorted
    const topPages = Object.entries(pages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, views]) => ({ name, views }));

    // Referrers sorted
    const topReferrers = Object.entries(referrers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // Device breakdown
    const totalDeviceViews = Object.values(devices).reduce((a, b) => a + b, 0) || 1;
    const deviceBreakdown = Object.entries(devices).map(([name, count]) => ({
      name,
      count,
      pct: Math.round((count / totalDeviceViews) * 100)
    }));

    // Top click elements
    const topClicks = Object.entries(clickElements)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return res.status(200).json({
      totalViews: parseInt(totalViews) || 0,
      totalClicks: parseInt(totalClicks) || 0,
      todayViews: parseInt(todayViews) || 0,
      todayVisitors: parseInt(todayVisitors) || 0,
      viewsByDay: days.map(d => ({ date: d, views: viewsByDay[d] || 0, clicks: clicksByDay[d] || 0 })),
      topPages,
      topReferrers,
      deviceBreakdown,
      topClicks
    });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
