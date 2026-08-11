const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { sendTelegram } = require('./telegram');

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_LOGIN,
    pass: process.env.BREVO_SMTP_KEY
  }
});

function getRedis() {
  let url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url) url = url.replace(/\/+$/, '');
  return { url, token };
}

async function redisGet(key) {
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

async function redisSet(key, value) {
  const { url, token } = getRedis();
  if (!url || !token) return null;
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  try {
    const res = await fetch(url + '/set/' + encodeURIComponent(key), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain' },
      body: serialized
    });
    return await res.json();
  } catch(e) { return null; }
}

async function redisDel(key) {
  const { url, token } = getRedis();
  if (!url || !token) return null;
  try {
    await fetch(url + '/del/' + encodeURIComponent(key), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: '{}'
    });
  } catch(e) {}
}

const MANAGER_USERNAME = (process.env.MANAGER_USERNAME || '').trim();
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || '';
const JWT_SECRET = process.env.JWT_SECRET || 'malty-admin-secret-2026-secure';
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000;

// Actions réservées à l'administrateur — jamais autorisées pour le manager
const ADMIN_ONLY_ACTIONS = ['subscriptions', 'invoices', 'users', 'deleteUser', 'deleteAllUsers', 'testRedis', 'setupWebhook', 'track-visit', 'ai-reply', 'accept'];

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function isRateLimited(ip) {
  const key = 'manager:fail:' + ip;
  const data = await redisGet(key);
  if (!data) return false;
  if (Date.now() > (data.resetAt || 0)) {
    await redisDel(key);
    return false;
  }
  return (data.fails || 0) >= 5;
}

async function recordFailure(ip) {
  const key = 'manager:fail:' + ip;
  const data = await redisGet(key);
  const now = Date.now();
  let fails = (data && now < (data.resetAt || 0)) ? (data.fails || 0) : 0;
  fails += 1;
  await redisSet(key, { fails, resetAt: now + 15 * 60 * 1000 });
}

async function clearFailures(ip) {
  await redisDel('manager:fail:' + ip);
}

function createToken(username, password) {
  if (!MANAGER_USERNAME || !MANAGER_PASSWORD) return null;
  if (!safeEqual(username, MANAGER_USERNAME)) return null;
  if (!safeEqual(password, MANAGER_PASSWORD)) return null;
  const payload = { authenticated: true, created: Date.now(), expires: Date.now() + TOKEN_EXPIRY };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex');
  return `${data}.${signature}`;
}

function verifyToken(token) {
  if (!token) return false;
  try {
    const [data, signature] = token.split('.');
    if (!data || !signature) return false;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex');
    if (signature !== expectedSig) return false;
    const payload = JSON.parse(Buffer.from(data, 'base64').toString());
    if (!payload.authenticated || Date.now() > payload.expires) return false;
    return true;
  } catch (err) {
    return false;
  }
}

function getStripe() {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    return require('stripe')(process.env.STRIPE_SECRET_KEY);
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://maltyshop.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `https://${req.headers.host}`);
  const action = url.searchParams.get('action');

  // AUTH: Login
  if (req.method === 'POST' && action === 'login') {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });

    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'Inconnue';

    if (await isRateLimited(ip)) {
      await sendTelegram(`🚫 MANAGER BLOQUÉ (trop de tentatives)\n\nIP: ${ip}\nDate: ${new Date().toLocaleString('fr-FR', {timeZone: 'Europe/Paris'})}`);
      return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
    }

    if (!MANAGER_USERNAME || !MANAGER_PASSWORD) {
      await sendTelegram(`⚠️ CONFIG MANAGER MANQUANTE\n\nLes variables MANAGER_USERNAME / MANAGER_PASSWORD ne sont pas définies sur le serveur.\nDate: ${new Date().toLocaleString('fr-FR', {timeZone: 'Europe/Paris'})}`);
      return res.status(401).json({ error: 'Connexion refusée' });
    }

    const token = createToken(username, password);
    if (!token) {
      await recordFailure(ip);
      await sendTelegram(`⚠️ TENTATIVE CONNEXION MANAGER ÉCHEC\n\nIdentifiant: "${username}"\nIP: ${ip}\nDate: ${new Date().toLocaleString('fr-FR', {timeZone: 'Europe/Paris'})}`);
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    }

    await clearFailures(ip);
    res.setHeader('Set-Cookie', `manager_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`);
    await sendTelegram(`🔐 CONNEXION MANAGER\n\nIP: ${ip}\nDate: ${new Date().toLocaleString('fr-FR', {timeZone: 'Europe/Paris'})}`);
    return res.status(200).json({ ok: true });
  }

  // AUTH: Check session
  if (req.method === 'GET' && action === 'check') {
    const cookies = req.headers.cookie || '';
    const tokenMatch = cookies.match(/manager_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;
    if (verifyToken(token)) return res.status(200).json({ authenticated: true });
    return res.status(401).json({ authenticated: false });
  }

  // AUTH: Logout
  if (req.method === 'POST' && action === 'logout') {
    res.setHeader('Set-Cookie', `manager_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    return res.status(200).json({ ok: true });
  }

  // PROTECTED ZONE — verify manager token for all remaining actions
  const cookies = req.headers.cookie || '';
  const tokenMatch = cookies.match(/manager_token=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : null;

  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  // Les actions admin-only sont explicitement refusées au manager
  if (ADMIN_ONLY_ACTIONS.indexOf(action) !== -1) {
    return res.status(403).json({ error: 'Action réservée à l\'administrateur' });
  }

  try {
    if (req.method === 'GET' && action === 'stats') {
      const idsRaw = await redisGet('request:ids');
      const ids = Array.isArray(idsRaw) ? idsRaw : [];
      let pending = 0;
      for (const id of ids) {
        const r = await redisGet('request:' + id);
        if (r && (!r.status || r.status === 'pending')) pending++;
      }

      let totalCustomers = null;
      const stripe = getStripe();
      if (stripe) {
        try {
          const customers = await stripe.customers.list({ limit: 100 });
          totalCustomers = customers.total_count || customers.data.length;
        } catch(e) {}
      }

      return res.status(200).json({
        pendingRequests: pending,
        totalRequests: ids.length,
        totalCustomers: totalCustomers
      });
    }

    if (req.method === 'GET' && action === 'requests') {
      const idsRaw = await redisGet('request:ids');
      const ids = Array.isArray(idsRaw) ? idsRaw : [];
      const requests = [];
      for (const id of ids) {
        const r = await redisGet('request:' + id);
        if (r) requests.push(r);
      }
      return res.status(200).json({ requests: requests, total: requests.length });
    }

    if (req.method === 'GET' && action === 'customers') {
      const stripe = getStripe();
      if (!stripe) return res.status(200).json({ customers: [], total: 0, error: 'Stripe non configuré' });
      const customers = await stripe.customers.list({ limit: 100 });
      return res.status(200).json({ customers: customers.data.map(c => ({
        id: c.id,
        name: c.name || 'N/A',
        email: c.email || 'N/A',
        created: new Date(c.created * 1000).toLocaleDateString('fr-FR')
      })), total: customers.data.length });
    }

    if (req.method === 'POST' && action === 'respond') {
      const { clientEmail, clientName, responseType, message, requestId, requestType } = req.body || {};
      if (!clientEmail || !message) return res.status(400).json({ error: 'Email et message requis' });

      const typeLabelsFR = { accepted: 'Acceptée', rejected: 'Refusée', in_progress: 'En cours', completed: 'Terminée' };
      await sendEmail(clientEmail, `[MALTY] Votre demande — ${typeLabelsFR[responseType] || responseType}`, responseEmailHtml(clientName, responseType, requestType || 'Support', message));
      await sendTelegram(`📨 RÉPONSE ENVOYÉE (MANAGER)\n\nClient: ${clientName}\nEmail: ${clientEmail}\nStatut: ${typeLabelsFR[responseType] || responseType}`);

      if (requestId) {
        const r = await redisGet('request:' + requestId);
        if (r) {
          r.status = responseType;
          r.response = message;
          r.respondedAt = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
          await redisSet('request:' + requestId, r);
        }
      }

      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST' && action === 'acceptRequest') {
      const { requestId } = req.body || {};
      if (!requestId) return res.status(400).json({ error: 'requestId requis' });

      const r = await redisGet('request:' + requestId);
      if (!r) return res.status(404).json({ error: 'Demande introuvable' });

      r.status = 'accepted';
      r.respondedAt = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
      await redisSet('request:' + requestId, r);

      await sendEmail(r.email, '[MALTY] Votre demande a été acceptée ✅', acceptEmailHtml(r.nom, r.type, r.message));
      await sendTelegram(`✅ DEMANDE ACCEPTÉE (MANAGER)\n\nClient: ${r.nom}\nEmail: ${r.email}\nType: ${r.type}\nDate: ${r.respondedAt}`);

      return res.status(200).json({ success: true, message: 'Demande acceptée, email envoyé au client' });
    }

    return res.status(400).json({ error: 'Action invalide' });

  } catch (error) {
    console.error('Manager API error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};

async function sendEmail(to, subject, html) {
  try {
    const info = await transporter.sendMail({
      from: '"MALTY" <maltyz@outlook.fr>',
      to: to,
      subject: subject,
      html: html
    });
    return { id: info.messageId };
  } catch (err) {
    console.error('Email error:', err.message);
  }
}

function responseEmailHtml(clientName, responseType, requestType, message) {
  const typeLabels = { accepted: 'Acceptée', rejected: 'Refusée', in_progress: 'En cours', completed: 'Terminée' };
  const typeEmoji = { accepted: '✅', rejected: '❌', in_progress: '🔄', completed: '🎉' };
  const statusColor = { accepted: '#22c55e', rejected: '#ef4444', in_progress: '#f59e0b', completed: '#0066ff' };
  const label = typeLabels[responseType] || responseType;
  const emoji = typeEmoji[responseType] || '📩';
  const color = statusColor[responseType] || '#0066ff';

  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0f1a;color:#e0e8f0;padding:0;border-radius:16px;overflow:hidden;border:1px solid #1a2a4a;">
    <div style="background:linear-gradient(135deg,#0066ff,#0044cc);padding:32px 40px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">${emoji}</div>
      <h1 style="color:#ffffff;font-size:24px;margin:0;font-weight:700;">Réponse MALTY</h1>
      <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">Concernant votre demande ${requestType}</p>
    </div>
    <div style="padding:32px 40px;">
      <p style="font-size:16px;margin:0 0 24px;">Bonjour <strong style="color:#ffffff;">${clientName || 'Client'}</strong>,</p>
      <p style="font-size:15px;color:#b0c4de;margin:0 0 24px;line-height:1.6;">Nous avons traité votre demande et voici notre réponse :</p>
      <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
          <span style="background:${color};color:#fff;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600;">${label}</span>
          <span style="color:#6a8cba;font-size:13px;">${requestType}</span>
        </div>
        <div style="background:#0d1a2e;border-left:4px solid ${color};padding:16px;border-radius:0 8px 8px 0;">
          <p style="margin:0;line-height:1.7;white-space:pre-wrap;font-size:15px;">${message}</p>
        </div>
      </div>
      <div style="text-align:center;margin:32px 0;">
        <a href="https://maltyshop.vercel.app/espace-client.html" style="display:inline-block;background:#0066ff;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">Mon espace client →</a>
      </div>
      <p style="font-size:14px;color:#6a8cba;text-align:center;line-height:1.5;">Si vous avez d'autres questions, n'hésitez pas à nous contacter via votre espace client.</p>
    </div>
    <div style="background:#0d1525;padding:20px 40px;text-align:center;border-top:1px solid #1a2a4a;">
      <p style="margin:0;font-size:13px;color:#4a6a8a;">— L'équipe MALTY</p>
      <p style="margin:4px 0 0;font-size:11px;color:#3a5a7a;">maltyshop.vercel.app</p>
    </div>
  </div>`;
}

function acceptEmailHtml(clientName, requestType, originalMessage) {
  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0f1a;color:#e0e8f0;padding:0;border-radius:16px;overflow:hidden;border:1px solid #1a2a4a;">
    <div style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:32px 40px;text-align:center;">
      <div style="font-size:48px;margin-bottom:8px;">✅</div>
      <h1 style="color:#ffffff;font-size:24px;margin:0;font-weight:700;">Demande acceptée !</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="font-size:16px;margin:0 0 24px;">Bonjour <strong style="color:#ffffff;">${clientName || 'Client'}</strong>,</p>
      <p style="font-size:15px;color:#b0c4de;margin:0 0 24px;line-height:1.7;">Bonne nouvelle ! Votre demande a été <strong style="color:#22c55e;">acceptée</strong> par notre équipe.</p>
      <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="background:#22c55e;color:#fff;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600;">Acceptée</span>
          <span style="color:#6a8cba;font-size:13px;">${requestType}</span>
        </div>
        ${originalMessage ? '<p style="color:#8ab4f8;font-size:13px;margin:0 0 8px;">Votre message :</p><p style="color:#b0c4de;font-size:14px;margin:0;line-height:1.5;">' + originalMessage.substring(0, 300) + '</p>' : ''}
      </div>
      <div style="background:#0d2818;border:1px solid #166534;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
        <p style="margin:0;font-size:15px;color:#86efac;">⏱️ Votre demande sera prête dans les <strong>24 heures</strong></p>
        <p style="margin:8px 0 0;font-size:13px;color:#4ade80;">Sauf urgence — contactez-nous si besoin</p>
      </div>
      <div style="text-align:center;margin:32px 0;">
        <a href="https://maltyshop.vercel.app/espace-client.html" style="display:inline-block;background:#0066ff;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">Mon espace client →</a>
      </div>
      <p style="font-size:14px;color:#6a8cba;text-align:center;line-height:1.5;">Merci pour votre confiance. Nous reviendrons vers vous très vite !</p>
    </div>
    <div style="background:#0d1525;padding:20px 40px;text-align:center;border-top:1px solid #1a2a4a;">
      <p style="margin:0;font-size:13px;color:#4a6a8a;">— L'équipe MALTY</p>
      <p style="margin:4px 0 0;font-size:11px;color:#3a5a7a;">maltyshop.vercel.app</p>
    </div>
  </div>`;
}
