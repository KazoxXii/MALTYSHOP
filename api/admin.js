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

const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || '').trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const JWT_SECRET = process.env.JWT_SECRET || 'malty-admin-secret-2026-secure';
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000;

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function isRateLimited(ip) {
  const key = 'admin:fail:' + ip;
  const data = await redisGet(key);
  if (!data) return false;
  if (Date.now() > (data.resetAt || 0)) {
    await redisDel(key);
    return false;
  }
  return (data.fails || 0) >= 5;
}

async function recordFailure(ip) {
  const key = 'admin:fail:' + ip;
  const data = await redisGet(key);
  const now = Date.now();
  let fails = (data && now < (data.resetAt || 0)) ? (data.fails || 0) : 0;
  fails += 1;
  await redisSet(key, { fails, resetAt: now + 15 * 60 * 1000 });
}

async function clearFailures(ip) {
  await redisDel('admin:fail:' + ip);
}

function createToken(username, password) {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return null;
  if (!safeEqual(username, ADMIN_USERNAME)) return null;
  if (!safeEqual(password, ADMIN_PASSWORD)) return null;
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
      await sendTelegram(`🚫 CONNEXION BLOQUÉE (trop de tentatives)\n\nIP: ${ip}\nDate: ${new Date().toLocaleString('fr-FR', {timeZone: 'Europe/Paris'})}`);
      return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
    }

    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
      await sendTelegram(`⚠️ CONFIG ADMIN MANQUANTE\n\nLes variables ADMIN_USERNAME / ADMIN_PASSWORD ne sont pas définies sur le serveur.\nDate: ${new Date().toLocaleString('fr-FR', {timeZone: 'Europe/Paris'})}`);
      return res.status(401).json({ error: 'Connexion refusée' });
    }

    const token = createToken(username, password);
    if (!token) {
      await recordFailure(ip);
      await sendTelegram(`⚠️ TENTATIVE CONNEXION ECHEC\n\nIdentifiant: "${username}"\nIP: ${ip}\nDate: ${new Date().toLocaleString('fr-FR', {timeZone: 'Europe/Paris'})}`);
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    }

    await clearFailures(ip);
    res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`);
    await sendTelegram(`🔓 CONNEXION ADMIN\n\nIP: ${ip}\nDate: ${new Date().toLocaleString('fr-FR', {timeZone: 'Europe/Paris'})}`);
    return res.status(200).json({ ok: true });
  }

  // AUTH: Check session
  if (req.method === 'GET' && action === 'check') {
    const cookies = req.headers.cookie || '';
    const tokenMatch = cookies.match(/admin_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;
    if (verifyToken(token)) return res.status(200).json({ authenticated: true });
    return res.status(401).json({ authenticated: false });
  }

  // AUTH: Logout
  if (req.method === 'POST' && action === 'logout') {
    res.setHeader('Set-Cookie', `admin_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    return res.status(200).json({ ok: true });
  }

  // TEST REDIS
  if (req.method === 'GET' && action === 'testRedis') {
    try {
      const r = getRedis();
      const baseUrl = r.url || 'MISSING';
      const hasToken = !!r.token;
      
      const setRes = await fetch(baseUrl + '/set/_test123', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + r.token, 'Content-Type': 'text/plain' },
        body: 'bonjour'
      });
      const setData = await setRes.json();
      
      const getRes = await fetch(baseUrl + '/get/_test123', {
        headers: { Authorization: 'Bearer ' + r.token }
      });
      const getData = await getRes.json();
      
      const delRes = await fetch(baseUrl + '/del/_test123', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + r.token, 'Content-Type': 'application/json' },
        body: '{}'
      });
      const delData = await delRes.json();

      return res.status(200).json({
        baseUrl: baseUrl.substring(0, 50),
        hasToken: hasToken,
        setResponse: setData,
        getResponse: getData,
        delResponse: delData,
        match: getData.result === 'bonjour'
      });
    } catch (e) {
      return res.status(200).json({ error: e.message, stack: e.stack });
    }
  }

  // PUBLIC ACTIONS (no auth needed)
  if (req.method === 'GET' && action === 'accept') {
    const requestId = url.searchParams.get('id');
    if (!requestId) return res.status(400).json({ error: 'Missing id' });

    const r = await redisGet('request:' + requestId);
    if (!r) return res.status(404).json({ error: 'Demande introuvable' });
    if (r.status === 'accepted') return res.status(200).json({ ok: true, message: 'Déjà acceptée' });

    r.status = 'accepted';
    r.respondedAt = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    await redisSet('request:' + requestId, r);

    let emailOk = false;
    try {
      const emailRes = await sendEmail(r.email, '[MALTY] Votre demande a été acceptée ✅', acceptEmailHtml(r.nom, r.type, r.message));
      emailOk = emailRes && emailRes.id;
    } catch(e) { console.error('Email error:', e.message); }

    await sendTelegram(`✅ DEMANDE ACCEPTÉE\n\nClient: ${r.nom}\nEmail: ${r.email}\nType: ${r.type}\nDate: ${r.respondedAt}\nEmail: ${emailOk ? 'Envoyé' : 'Échoué'}`);

    return res.status(200).json({ ok: true, emailSent: emailOk });
  }

  if (req.method === 'POST' && action === 'ai-reply') {
    const { clientName, requestType, clientMessage } = req.body || {};
    if (!clientMessage) return res.status(400).json({ error: 'Message requis' });
    const name = clientName || 'Client';
    const type = requestType || 'Support technique';
    const msg = clientMessage.toLowerCase();
    let response = '';
    if (type.includes('Maintenance')) {
      if (msg.includes('bug') || msg.includes('erreur') || msg.includes('ne fonctionne')) {
        response = `Bonjour ${name},\n\nMerci pour votre signalement. Notre équipe technique va analyser le problème. En général, ce type de problème est résolu sous 24 à 48h.\n\nNous reviendrons vers vous dès que le correctif sera en place.\n\nCordialement,\nL'équipe MALTY`;
      } else if (msg.includes('lent') || msg.includes('performance')) {
        response = `Bonjour ${name},\n\nMerci de nous avoir signalé ce souci de performance. Nous allons examiner les temps de chargement et optimiser le site.\n\nCordialement,\nL'équipe MALTY`;
      } else {
        response = `Bonjour ${name},\n\nBien reçu votre demande de maintenance. Notre équipe l'examine et reviendrons vers vous rapidement.\n\nCordialement,\nL'équipe MALTY`;
      }
    } else if (type.includes('Abonnement')) {
      response = `Bonjour ${name},\n\nMerci pour votre message concernant votre abonnement.\n\nNous sommes là pour vous accompagner. N'hésitez pas à nous décrire votre besoin en détail.\n\nCordialement,\nL'équipe MALTY`;
    } else if (type.includes('devis')) {
      response = `Bonjour ${name},\n\nMerci pour votre demande de devis ! Pourriez-vous nous décrire votre projet ?\n\n• Type de site souhaité\n• Nombre de pages\n• Fonctionnalités spécifiques\n\nNous préparons votre devis personnalisé.\n\nCordialement,\nL'équipe MALTY`;
    } else {
      response = `Bonjour ${name},\n\nMerci pour votre message. Nous l'avons bien reçu et nous reviendrons vers vous très rapidement.\n\nCordialement,\nL'équipe MALTY`;
    }
    return res.status(200).json({ response });
  }

  if (req.method === 'GET' && action === 'setupWebhook') {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) return res.status(500).json({ error: 'BOT_TOKEN missing' });
    const webhookUrl = 'https://maltyshop.vercel.app/api/admin?action=setupWebhook';
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl })
    });
    const data = await r.json();
    return res.status(200).json({ ok: true, webhook: data, url: webhookUrl });
  }

  // TRACK VISITOR (public, no auth)
  if (req.method === 'POST' && action === 'track-visit') {
    try {
      const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'Inconnu';
      const { page, referrer, screen, lang, ua, lat, lon } = req.body || {};

      let geo = {};
      try {
        const geoRes = await fetch('http://ip-api.com/json/' + ip + '?fields=status,country,countryCode,regionName,city,lat,lon,isp,org,as,mobile,proxy,hosting');
        geo = await geoRes.json();
      } catch(e) {}

      const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
      const country = geo.status === 'success' ? geo.country : 'Inconnu';
      const city = geo.status === 'success' ? geo.city : 'Inconnu';
      const region = geo.status === 'success' ? geo.regionName : '';
      const isp = geo.status === 'success' ? geo.isp : '';
      const isProxy = geo.proxy ? '⚠️ VPN/Proxy' : '';
      const isHosting = geo.hosting ? '🖥️ Serveur' : '';
      const isMobile = geo.mobile ? '📱 Mobile' : '💻 Desktop';
      const finalLat = lat || geo.lat;
      const finalLon = lon || geo.lon;
      const coords = finalLat && finalLon ? `https://maps.google.com/?q=${finalLat},${finalLon}` : '';

      let browserInfo = '';
      if (ua) {
        if (ua.includes('iPhone')) browserInfo = '📱 iPhone';
        else if (ua.includes('Android')) browserInfo = '📱 Android';
        else if (ua.includes('iPad')) browserInfo = '📱 iPad';
        else if (ua.includes('Mac')) browserInfo = '💻 Mac';
        else if (ua.includes('Windows')) browserInfo = '💻 Windows';
        else if (ua.includes('Linux')) browserInfo = '💻 Linux';
        else browserInfo = '💻 ' + ua.substring(0, 50);
      }

      let msg = `🌍 NOUVEAU VISITEUR\n\n`;
      msg += `📍 ${city}, ${region}, ${country}\n`;
      msg += `🌐 IP: ${ip}\n`;
      msg += `📡 FAI: ${isp}\n`;
      msg += `${isMobile}\n`;
      if (browserInfo) msg += `${browserInfo}\n`;
      if (isProxy) msg += `${isProxy}\n`;
      if (isHosting) msg += `${isHosting}\n`;
      msg += `🔗 Page: ${page || '—'}\n`;
      msg += `🔍 Source: ${referrer || 'Direct'}\n`;
      msg += `🖥️ Écran: ${screen || '—'}\n`;
      msg += `🗣️ Langue: ${lang || '—'}\n`;
      if (coords) msg += `🗺️ GPS: ${coords}\n`;
      msg += `📅 ${now}`;

      await sendTelegram(msg);

      const visitId = 'visit:' + Date.now();
      await redisSet(visitId, {
        ip, page, referrer, screen, lang, ua,
        country, city, region, isp, lat: finalLat, lon: finalLon,
        mobile: geo.mobile, proxy: geo.proxy, date: now
      });

      return res.status(200).json({ ok: true });
    } catch(e) {
      return res.status(200).json({ ok: true });
    }
  }

  // PROTECTED ZONE — verify token for all other actions
  const cookies = req.headers.cookie || '';
  const tokenMatch = cookies.match(/admin_token=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : null;

  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  try {
    if (req.method === 'GET' && action === 'stats') {
      const subscriptions = await stripe.subscriptions.list({ limit: 100 });
      const invoices = await stripe.invoices.list({ limit: 100 });
      const customers = await stripe.customers.list({ limit: 100 });

      const activeSubs = subscriptions.data.filter(s => s.status === 'active').length;
      const totalRevenue = invoices.data
        .filter(i => i.status === 'paid')
        .reduce((sum, i) => sum + i.amount_paid / 100, 0);
      const pendingInvoices = invoices.data.filter(i => i.status === 'open').length;

      return res.status(200).json({
        activeSubscriptions: activeSubs,
        totalRevenue: totalRevenue,
        pendingInvoices: pendingInvoices,
        totalCustomers: customers.total_count || customers.data.length
      });
    }

    if (req.method === 'GET' && action === 'subscriptions') {
      const subscriptions = await stripe.subscriptions.list({ limit: 100 });
      const customers = await stripe.customers.list({ limit: 100 });

      const subs = subscriptions.data.map(sub => {
        const customer = customers.data.find(c => c.id === sub.items.data[0].customer);
        return {
          id: sub.id,
          status: sub.status,
          plan: sub.metadata?.plan === 'premium' ? 'Premium 39€' : 'Essentiel 19€',
          email: customer?.email || 'N/A',
          name: customer?.name || sub.metadata?.firstName || 'Client',
          startDate: new Date(sub.created * 1000).toLocaleDateString('fr-FR'),
          currentPeriodEnd: new Date(sub.current_period_end * 1000).toLocaleDateString('fr-FR'),
          amount: sub.items.data[0].plan.amount / 100
        };
      });

      return res.status(200).json({ subscriptions: subs });
    }

    if (req.method === 'GET' && action === 'customers') {
      const customers = await stripe.customers.list({ limit: 100 });
      return res.status(200).json({ customers: customers.data.map(c => ({
        id: c.id,
        name: c.name || 'N/A',
        email: c.email || 'N/A',
        created: new Date(c.created * 1000).toLocaleDateString('fr-FR')
      }))});
    }

    if (req.method === 'GET' && action === 'invoices') {
      const invoices = await stripe.invoices.list({ limit: 50 });
      return res.status(200).json({ invoices: invoices.data.map(inv => ({
        id: inv.id,
        number: inv.number,
        amount: inv.amount_paid / 100,
        status: inv.status,
        email: inv.customer_email,
        name: inv.customer_name || 'N/A',
        date: new Date(inv.created * 1000).toLocaleDateString('fr-FR'),
        url: inv.hosted_invoice_url
      }))});
    }

    // LIST ALL REGISTERED USERS
    if (req.method === 'GET' && action === 'users') {
      const emailListRaw = await redisGet('user:emails');
      const emailList = Array.isArray(emailListRaw) ? emailListRaw : [];
      const users = [];
      for (const email of emailList) {
        const u = await redisGet(`user:${email}`);
        if (u) {
          users.push({
            nom: u.nom || 'N/A',
            email: u.email,
            phone: u.phone || '',
            plan: u.plan || null,
            createdAt: u.createdAt || 'N/A',
            sites: u.sites || []
          });
        }
      }
      return res.status(200).json({ users: users, total: users.length });
    }

    // DELETE USER
    if (req.method === 'POST' && action === 'deleteUser') {
      const { email: targetEmail } = req.body || {};
      if (!targetEmail) return res.status(400).json({ error: 'Email requis' });
      const em = targetEmail.toLowerCase();
      await redisDel(`user:${em}`);
      const emailListRaw = await redisGet('user:emails');
      const emailList = Array.isArray(emailListRaw) ? emailListRaw : [];
      const filtered = emailList.filter(e => e !== em);
      await redisSet('user:emails', filtered);
      return res.status(200).json({ ok: true });
    }

    // DELETE ALL USERS
    if (req.method === 'POST' && action === 'deleteAllUsers') {
      const emailListRaw = await redisGet('user:emails');
      const emailList = Array.isArray(emailListRaw) ? emailListRaw : [];
      for (const email of emailList) {
        await redisDel(`user:${email}`);
      }
      await redisSet('user:emails', []);
      return res.status(200).json({ ok: true, deleted: emailList.length });
    }

    // RESET CLIENT PASSWORD — sets a new password and emails it to the client
    if (req.method === 'POST' && action === 'resetPassword') {
      const { email: targetEmail, newPassword } = req.body || {};
      if (!targetEmail) return res.status(400).json({ error: 'Email requis' });
      const em = targetEmail.toLowerCase();
      const u = await redisGet('user:' + em);
      if (!u) return res.status(404).json({ error: 'Client introuvable' });
      const pw = (newPassword && newPassword.length >= 6) ? newPassword : genPassword();
      u.password = hashPw(pw);
      await redisSet('user:' + em, u);

      let emailOk = false;
      try {
        const emailRes = await sendEmail(em, '[MALTY] Votre nouveau mot de passe 🔑', resetPasswordEmailHtml(u.nom, pw));
        emailOk = emailRes && emailRes.id;
      } catch(e) { console.error('Reset password email error:', e.message); }

      await sendTelegram(`🔑 MOT DE PASSE RÉINITIALISÉ (ADMIN)\n\nClient: ${u.nom}\nEmail: ${em}\nDate: ${new Date().toLocaleString('fr-FR', {timeZone: 'Europe/Paris'})}\nEmail: ${emailOk ? 'Envoyé' : 'ÉCHOUÉ'}`);

      return res.status(200).json({ ok: true, emailSent: emailOk });
    }

    // LIST ALL SUPPORT REQUESTS
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

    // RESPOND TO CLIENT + UPDATE REQUEST STATUS
    if (req.method === 'POST' && action === 'respond') {
      const { clientEmail, clientName, responseType, message, requestId, requestType } = req.body || {};
      if (!clientEmail || !message) return res.status(400).json({ error: 'Email et message requis' });

      const typeLabelsFR = { accepted: 'Acceptée', rejected: 'Refusée', in_progress: 'En cours', completed: 'Terminée' };
      await sendEmail(clientEmail, `[MALTY] Votre demande — ${typeLabelsFR[responseType] || responseType}`, responseEmailHtml(clientName, responseType, requestType || 'Support', message));
      await sendTelegram(`📨 REPONSE ENVOYEE\n\nClient: ${clientName}\nEmail: ${clientEmail}\nStatut: ${typeLabelsFR[responseType] || responseType}`);

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

    // ACCEPT REQUEST — sends auto email to client
    if (req.method === 'POST' && action === 'acceptRequest') {
      const { requestId } = req.body || {};
      if (!requestId) return res.status(400).json({ error: 'requestId requis' });

      const r = await redisGet('request:' + requestId);
      if (!r) return res.status(404).json({ error: 'Demande introuvable' });

      r.status = 'accepted';
      r.respondedAt = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
      await redisSet('request:' + requestId, r);

      const autoMessage = `Bonjour ${r.nom},\n\nVotre demande (${r.type}) a bien été prise en compte par notre équipe !\n\nNous allons travailler dessus et elle sera prête dans les 24 heures qui suivent.\n\nSi votre demande est urgente, n'hésitez pas à nous en informer.\n\nMerci pour votre confiance.\n\nL'équipe MALTY`;

      await sendEmail(r.email, '[MALTY] Votre demande a été acceptée ✅', acceptEmailHtml(r.nom, r.type, r.message));
      await sendTelegram(`✅ DEMANDE ACCEPTÉE\n\nClient: ${r.nom}\nEmail: ${r.email}\nType: ${r.type}\nDate: ${r.respondedAt}`);

      return res.status(200).json({ success: true, message: 'Demande acceptée, email envoyé au client' });
    }

    // ACCEPT REQUEST from Telegram URL button (no auth needed)
    return res.status(400).json({ error: 'Action invalide' });

  } catch (error) {
    console.error('Admin API error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

function hashPw(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function resetPasswordEmailHtml(clientName, newPassword) {
  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0f1a;color:#e0e8f0;padding:0;border-radius:16px;overflow:hidden;border:1px solid #1a2a4a;">
    <div style="background:linear-gradient(135deg,#0066ff,#0044cc);padding:32px 40px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">🔑</div>
      <h1 style="color:#ffffff;font-size:24px;margin:0;font-weight:700;">Nouveau mot de passe</h1>
    </div>
    <div style="padding:32px 40px;text-align:center;">
      <p style="font-size:16px;margin:0 0 24px;">Bonjour <strong style="color:#ffffff;">${clientName || 'Client'}</strong>,</p>
      <p style="font-size:15px;color:#b0c4de;margin:0 0 24px;line-height:1.6;">Notre équipe a réinitialisé le mot de passe de votre espace client. Voici votre nouvel identifiant de connexion :</p>
      <div style="background:#111f35;border:2px dashed #0066ff;border-radius:16px;padding:24px;margin-bottom:24px;">
        <p style="font-size:13px;color:#6a8cba;margin:0 0 8px;">Identifiant (email)</p>
        <p style="font-size:18px;font-weight:700;color:#fff;margin:0 0 20px;">Votre email de connexion</p>
        <p style="font-size:13px;color:#6a8cba;margin:0 0 8px;">Nouveau mot de passe</p>
        <p style="font-size:28px;font-weight:900;color:#0066ff;letter-spacing:3px;margin:0;font-family:monospace;">${newPassword}</p>
      </div>
      <div style="text-align:center;margin:32px 0;">
        <a href="https://maltyshop.vercel.app/login.html" style="display:inline-block;background:#0066ff;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">Se connecter →</a>
      </div>
      <p style="font-size:14px;color:#6a8cba;text-align:center;line-height:1.5;">Pensez à changer ce mot de passe une fois connecté, depuis votre espace client.</p>
    </div>
    <div style="background:#0d1525;padding:20px 40px;text-align:center;border-top:1px solid #1a2a4a;">
      <p style="margin:0;font-size:13px;color:#4a6a8a;">— L'équipe MALTY</p>
      <p style="margin:4px 0 0;font-size:11px;color:#3a5a7a;">maltyshop.vercel.app</p>
    </div>
  </div>`;
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
