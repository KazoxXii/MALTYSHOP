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

const MALTY_EMAIL = process.env.ADMIN_EMAIL || 'maltyz@outlook.fr';

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

async function saveRequest(reqData) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const request = { id, ...reqData, status: 'pending', response: null, respondedAt: null };
  await redisSet('request:' + id, request);
  const listRaw = await redisGet('request:ids');
  const list = Array.isArray(listRaw) ? listRaw : [];
  list.unshift(id);
  await redisSet('request:ids', list);
  return request;
}

async function sendEmail(to, subject, html) {
  const info = await transporter.sendMail({
    from: '"MALTY" <maltyz@outlook.fr>',
    to: to,
    subject: subject,
    html: html
  });
  return { id: info.messageId };
}

function devisEmailToMalty(data) {
  const formuleEmoji = {
    'Landing Page': '🚀',
    'Portfolio': '🖼️',
    'Vitrine': '🏢',
    'Premium': '💎',
    'Application Mobile': '📱',
    'Je ne sais pas encore': '🤔'
  };

  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0f1a;color:#e0e8f0;padding:40px;border-radius:12px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="background:#0066ff;width:60px;height:60px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#fff;">M</div>
    </div>
    <h1 style="color:#00cc66;font-size:22px;text-align:center;margin-bottom:8px;">${formuleEmoji[data.formule] || '📩'} Nouvelle demande de devis</h1>
    <p style="color:#6a8cba;text-align:center;margin-bottom:32px;">Un client a soumis une demande depuis la page Commander.</p>

    <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="font-size:14px;color:#0066ff;margin-bottom:16px;">🧾 LE PROJET</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;width:140px;">Pack</td><td style="padding:6px 0;font-weight:600;color:#00cc66;">${data.formule || '—'}</td></tr>
      </table>
    </div>

    <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="font-size:14px;color:#0066ff;margin-bottom:16px;">👤 CONTACT</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;width:140px;">Nom / Entreprise</td><td style="padding:6px 0;font-weight:600;">${data.nom || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Email</td><td style="padding:6px 0;"><a href="mailto:${data.email}" style="color:#0066ff;text-decoration:none;">${data.email || '—'}</a></td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Téléphone</td><td style="padding:6px 0;"><a href="tel:${data.telephone}" style="color:#0066ff;text-decoration:none;">${data.telephone || '—'}</a></td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Ville / Secteur</td><td style="padding:6px 0;">${data.ville || '—'}</td></tr>
      </table>
    </div>

    <div style="text-align:center;">
      <a href="mailto:${data.email}?subject=Re: Votre devis MALTY" style="display:inline-block;background:#0066ff;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Répondre au client</a>
    </div>
    <p style="color:#6a8cba;font-size:11px;text-align:center;margin-top:32px;">— MALTY Devis</p>
  </div>`;
}

function devisConfirmationToClient(data) {
  const formuleLabels = {
    'Landing Page': 'Pack Landing Page — 150€',
    'Portfolio': 'Pack Portfolio — 350€',
    'Vitrine': 'Pack Site Vitrine — 600€',
    'Premium': 'Pack Sur-Mesure — 950€',
    'Application Mobile': 'Application Mobile iOS/Android — 1 200€',
    'Je ne sais pas encore': 'Pack conseillé par MALTY'
  };

  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0f1a;color:#e0e8f0;padding:40px;border-radius:12px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="background:#0066ff;width:60px;height:60px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#fff;">M</div>
    </div>
    <h1 style="color:#00cc66;font-size:22px;text-align:center;margin-bottom:8px;">✅ Demande envoyée !</h1>
    <p style="color:#6a8cba;text-align:center;margin-bottom:32px;">Bonjour ${data.nom || 'Client'}, j'ai bien reçu votre demande.</p>

    <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="font-size:14px;color:#0066ff;margin-bottom:16px;">📋 Récapitulatif</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6a8cba;font-size:13px;width:120px;">Pack</td><td style="padding:8px 0;font-weight:600;color:#00cc66;">${formuleLabels[data.formule] || data.formule}</td></tr>
        <tr><td style="padding:8px 0;color:#6a8cba;font-size:13px;">Email</td><td style="padding:8px 0;">${data.email}</td></tr>
      </table>
    </div>

    <div style="background:#0d1a2e;border-left:4px solid #0066ff;padding:16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;">📅 <strong>Délai de réponse :</strong> Sous 24 heures ouvrées</p>
    </div>
    <p style="color:#6a8cba;font-size:13px;text-align:center;">— MALTY</p>
  </div>`;
}

function notifyDevisTelegram(data) {
  return sendTelegram(
    `📩 NOUVELLE DEMANDE DE DEVIS\n\n` +
    `📦 Pack: ${data.formule || 'Non précisé'}\n` +
    `👤 Nom: ${data.nom || '—'}\n` +
    `📧 Email: ${data.email || '—'}\n` +
    `📞 Tel: ${data.telephone || '—'}\n` +
    `📍 Ville: ${data.ville || '—'}\n` +
    `📅 Date: ${data.date}\n` +
    `⚡ Répondre sous 24h`
  );
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const data = req.body || {};
  if (!data.nom || !data.email || !data.formule) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const payload = { ...data, date: now };

  try {
    // Save to Redis FIRST
    try {
      await saveRequest({
        nom: data.nom,
        email: data.email,
        type: 'Devis — ' + data.formule,
        site: '',
        message: 'Pack: ' + data.formule + ' | Tel: ' + (data.telephone || '—') + ' | Ville: ' + (data.ville || '—'),
        date: now
      });
    } catch (e) {
      console.error('Redis save error:', e.message);
    }

    // Email to MALTY
    try {
      await sendEmail(
        MALTY_EMAIL,
        `📩 Nouveau devis — ${data.formule} (${data.nom})`,
        devisEmailToMalty(payload)
      );
    } catch (e) {
      console.error('Email MALTY error:', e.message);
    }

    // Confirmation to client
    try {
      await sendEmail(
        data.email,
        `✅ [MALTY] Votre demande a bien été envoyée`,
        devisConfirmationToClient(payload)
      );
    } catch (e) {
      console.error('Email client error:', e.message);
    }

    // Telegram
    try {
      await notifyDevisTelegram(payload);
    } catch (e) {
      console.error('Telegram error:', e.message);
    }

    return res.status(200).json({ ok: true, message: 'Demande envoyée' });
  } catch (err) {
    console.error('Devis API error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
