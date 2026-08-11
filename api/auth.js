const crypto = require('crypto');
const nodemailer = require('nodemailer');

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

async function rGet(key) {
  const { url, token } = getRedis();
  if (!url || !token) throw new Error('Redis not configured');
  const res = await fetch(url + '/get/' + encodeURIComponent(key), {
    headers: { Authorization: 'Bearer ' + token }
  });
  const data = await res.json();
  if (data.result === null || data.result === undefined) return null;
  if (typeof data.result === 'string') {
    try { return JSON.parse(data.result); } catch(e) { return data.result; }
  }
  return data.result;
}

async function rSet(key, value) {
  const { url, token } = getRedis();
  if (!url || !token) throw new Error('Redis not configured');
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const res = await fetch(url + '/set/' + encodeURIComponent(key), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain' },
    body: serialized
  });
  return await res.json();
}

async function rDel(key) {
  const { url, token } = getRedis();
  if (!url || !token) return;
  await fetch(url + '/del/' + encodeURIComponent(key), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: '{}'
  });
}

async function rSetEx(key, value, seconds) {
  const { url, token } = getRedis();
  if (!url || !token) throw new Error('Redis not configured');
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const res = await fetch(url + '/setex/' + encodeURIComponent(key) + '/' + seconds, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain' },
    body: serialized
  });
  return await res.json();
}

async function sendVerifyEmail(to, code) {
  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0f1a;color:#e0e8f0;padding:0;border-radius:16px;overflow:hidden;border:1px solid #1a2a4a;">
    <div style="background:linear-gradient(135deg,#0066ff,#0044cc);padding:40px;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">📧</div>
      <h1 style="color:#ffffff;font-size:26px;margin:0;font-weight:700;">Vérifiez votre email</h1>
      <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">Code de confirmation MALTY</p>
    </div>
    <div style="padding:32px 40px;text-align:center;">
      <p style="font-size:15px;color:#b0c4de;margin:0 0 24px;">Voici votre code de vérification :</p>
      <div style="background:#111f35;border:2px dashed #0066ff;border-radius:16px;padding:24px;margin-bottom:24px;">
        <p style="font-size:42px;font-weight:900;color:#0066ff;letter-spacing:12px;margin:0;font-family:monospace;">${code}</p>
      </div>
      <p style="font-size:14px;color:#6a8cba;margin:0 0 16px;">Ce code expire dans <strong style="color:#e0e8f0;">10 minutes</strong>.</p>
      <p style="font-size:13px;color:#4a6a8a;">Si vous n'avez pas créé de compte, ignorez cet email.</p>
    </div>
    <div style="background:#0d1525;padding:20px 40px;text-align:center;border-top:1px solid #1a2a4a;">
      <p style="margin:0;font-size:13px;color:#4a6a8a;">— L'équipe MALTY</p>
      <p style="margin:4px 0 0;font-size:11px;color:#3a5a7a;">maltyshop.vercel.app</p>
    </div>
  </div>`;
  try {
    const info = await transporter.sendMail({
      from: '"MALTY" <maltyz@outlook.fr>',
      to: to,
      subject: '[MALTY] Code de vérification — ' + code,
      html: html
    });
    return { ok: true, id: info.messageId };
  } catch (err) {
    console.error('Email error:', err.message);
    return { ok: false, error: err.message };
  }
}

function genCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }

async function notify(msg) {
  const BOT = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT = process.env.TELEGRAM_CHAT_ID;
  if (!BOT || !CHAT) return;
  try {
    await fetch('https://api.telegram.org/bot' + BOT + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ chat_id: CHAT, text: msg })
    });
  } catch(e) {}
}

function hash(pw) { return crypto.createHash('sha256').update(pw).digest('hex'); }
function genToken() { return crypto.randomBytes(32).toString('hex'); }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const b = req.body || {};
  const action = b.action;
  const email = b.email;
  const password = b.password;
  const nom = b.nom;
  const phone = b.phone;
  const ip = req.headers['x-forwarded-for'] || 'Inconnu';
  const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  // REGISTER — Step 1: Send verification code
  if (action === 'register') {
    if (!email || !password || !nom) {
      return res.status(400).json({ error: 'Champs manquants' });
    }
    var em = email.toLowerCase();
    var exists = await rGet('user:' + em);
    if (exists) {
      return res.status(409).json({ error: 'Un compte existe deja avec cet email' });
    }
    var code = genCode();
    var pendingUser = { prenom: b.prenom || '', nom: nom, email: em, phone: phone || '', entreprise: b.entreprise || '', password: hash(password), createdAt: new Date().toISOString() };
    await rSetEx('verify:' + em, { code: code, user: pendingUser }, 600);

    var emailResult = await sendVerifyEmail(em, code);

    notify('🆕 NOUVELLE INSCRIPTION EN ATTENTE\n\nNom: ' + nom + '\nEmail: ' + em + '\nTel: ' + (phone || 'N/A') + '\nDate: ' + now + '\nIP: ' + ip);

    return res.status(200).json({ ok: true, step: 'verify', email: em, message: 'Code envoyé par email' });
  }

  // VERIFY EMAIL — Step 2: Confirm code and create account
  if (action === 'verify-email') {
    if (!email || !b.code) {
      return res.status(400).json({ error: 'Code requis' });
    }
    var em = email.toLowerCase();
    var pending = await rGet('verify:' + em);
    if (!pending) {
      return res.status(400).json({ error: 'Code expiré. Recommencez l\'inscription.' });
    }
    if (pending.code !== b.code) {
      return res.status(400).json({ error: 'Code incorrect' });
    }

    var u = pending.user;
    var tk = genToken();
    u.token = tk;
    await rSet('user:' + em, u);
    await rDel('verify:' + em);

    var listRaw = await rGet('user:emails');
    var list = Array.isArray(listRaw) ? listRaw : [];
    if (list.indexOf(em) === -1) { list.push(em); await rSet('user:emails', list); }

    notify('✅ COMPTE VALIDÉ\n\nNom: ' + u.nom + '\nEmail: ' + em + '\nDate: ' + now);

    return res.status(200).json({ ok: true, token: tk, user: { prenom: u.prenom, nom: u.nom, email: u.email, phone: u.phone, entreprise: u.entreprise } });
  }

  // RESEND CODE
  if (action === 'resend-code') {
    if (!email) {
      return res.status(400).json({ error: 'Email requis' });
    }
    var em = email.toLowerCase();
    var pending = await rGet('verify:' + em);
    if (!pending) {
      return res.status(400).json({ error: 'Aucun code en attente. Recommencez l\'inscription.' });
    }
    var code = genCode();
    pending.code = code;
    await rSetEx('verify:' + em, pending, 600);

    await sendVerifyEmail(em, code);

    return res.status(200).json({ ok: true, message: 'Nouveau code envoyé' });
  }

  // LOGIN
  if (action === 'login') {
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    var em = email.toLowerCase();
    var u = await rGet('user:' + em);
    if (!u || u.password !== hash(password)) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    var tk = genToken();
    u.token = tk;
    await rSet('user:' + em, u);

    notify('🔓 CONNEXION\n\nNom: ' + u.nom + '\nEmail: ' + em + '\nDate: ' + now + '\nIP: ' + ip);

    return res.status(200).json({ ok: true, token: tk, user: { prenom: u.prenom, nom: u.nom, email: u.email, phone: u.phone, entreprise: u.entreprise, plan: u.plan } });
  }

  // CHECK
  if (action === 'check') {
    if (!email || !token) {
      return res.status(400).json({ error: 'Token requis' });
    }
    var em = email.toLowerCase();
    var u = await rGet('user:' + em);
    if (!u || u.token !== token) {
      return res.status(401).json({ error: 'Token invalide' });
    }
    return res.status(200).json({ ok: true, user: { prenom: u.prenom, nom: u.nom, email: u.email, phone: u.phone, entreprise: u.entreprise, plan: u.plan } });
  }

  // LOGOUT
  if (action === 'logout') {
    if (email) {
      var em = email.toLowerCase();
      var u = await rGet('user:' + em);
      if (u) { u.token = null; await rSet('user:' + em, u); }
    }
    return res.status(200).json({ ok: true });
  }

  // UPDATE PROFILE
  if (action === 'updateProfile') {
    if (!email || !token || !b.newNom || !b.newEmail) {
      return res.status(400).json({ error: 'Champs manquants' });
    }
    var em = email.toLowerCase();
    var u = await rGet('user:' + em);
    if (!u || u.token !== token) {
      return res.status(401).json({ error: 'Non autorise' });
    }
    var newEm = b.newEmail.toLowerCase();
    var newNom = b.newNom;
    var newPrenom = b.newPrenom || '';
    var newPhone = b.newPhone || '';
    var newEntreprise = b.newEntreprise || '';

    if (newEm !== em) {
      var exists = await rGet('user:' + newEm);
      if (exists) return res.status(409).json({ error: 'Cet email est deja utilise' });
      u.prenom = newPrenom; u.nom = newNom; u.email = newEm; u.phone = newPhone; u.entreprise = newEntreprise;
      await rSet('user:' + newEm, u);
      await rDel('user:' + em);
      var listRaw = await rGet('user:emails');
      var list = Array.isArray(listRaw) ? listRaw : [];
      var idx = list.indexOf(em);
      if (idx !== -1) list.splice(idx, 1);
      if (list.indexOf(newEm) === -1) list.push(newEm);
      await rSet('user:emails', list);
      var ntk = genToken(); u.token = ntk;
      await rSet('user:' + newEm, u);
      return res.status(200).json({ ok: true, token: ntk, user: { prenom: newPrenom, nom: newNom, email: newEm, phone: newPhone, entreprise: newEntreprise } });
    }

    u.prenom = newPrenom; u.nom = newNom; u.phone = newPhone; u.entreprise = newEntreprise;
    await rSet('user:' + em, u);
    return res.status(200).json({ ok: true, user: { prenom: newPrenom, nom: newNom, email: em, phone: newPhone, entreprise: newEntreprise } });
  }

  // CHANGE PASSWORD
  if (action === 'changePassword') {
    if (!email || !token || !b.oldPassword || !b.newPassword) {
      return res.status(400).json({ error: 'Champs manquants' });
    }
    var em = email.toLowerCase();
    var u = await rGet('user:' + em);
    if (!u || u.token !== token) return res.status(401).json({ error: 'Non autorise' });
    if (u.password !== hash(b.oldPassword)) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    if (b.newPassword.length < 6) return res.status(400).json({ error: 'Minimum 6 caracteres' });
    u.password = hash(b.newPassword);
    await rSet('user:' + em, u);
    notify('🔒 MOT DE PASSE CHANGÉ\n\nNom: ' + u.nom + '\nEmail: ' + em + '\nDate: ' + now);
    return res.status(200).json({ ok: true });
  }

  // FORGOT PASSWORD — Send reset code
  if (action === 'forgot-password') {
    if (!email) {
      return res.status(400).json({ error: 'Email requis' });
    }
    var em = email.toLowerCase();
    var u = await rGet('user:' + em);
    if (!u) {
      return res.status(200).json({ ok: true, message: 'Si cet email existe, un code de réinitialisation a été envoyé.' });
    }
    var code = genCode();
    await rSetEx('reset:' + em, { code: code, email: em }, 600);

    var html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0f1a;color:#e0e8f0;padding:0;border-radius:16px;overflow:hidden;border:1px solid #1a2a4a;">
      <div style="background:linear-gradient(135deg,#0066ff,#0044cc);padding:40px;text-align:center;">
        <div style="font-size:48px;margin-bottom:12px;">🔑</div>
        <h1 style="color:#ffffff;font-size:26px;margin:0;font-weight:700;">Réinitialisation</h1>
        <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">Code de réinitialisation MALTY</p>
      </div>
      <div style="padding:32px 40px;text-align:center;">
        <p style="font-size:15px;color:#b0c4de;margin:0 0 24px;">Voici votre code de réinitialisation de mot de passe :</p>
        <div style="background:#111f35;border:2px dashed #0066ff;border-radius:16px;padding:24px;margin-bottom:24px;">
          <p style="font-size:42px;font-weight:900;color:#0066ff;letter-spacing:12px;margin:0;font-family:monospace;">${code}</p>
        </div>
        <p style="font-size:14px;color:#6a8cba;margin:0 0 16px;">Ce code expire dans <strong style="color:#e0e8f0;">10 minutes</strong>.</p>
        <p style="font-size:13px;color:#4a6a8a;">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
      </div>
      <div style="background:#0d1525;padding:20px 40px;text-align:center;border-top:1px solid #1a2a4a;">
        <p style="margin:0;font-size:13px;color:#4a6a8a;">— L'équipe MALTY</p>
        <p style="margin:4px 0 0;font-size:11px;color:#3a5a7a;">maltyshop.vercel.app</p>
      </div>
    </div>`;
    try {
      await transporter.sendMail({
        from: '"MALTY" <maltyz@outlook.fr>',
        to: em,
        subject: '[MALTY] Code de réinitialisation — ' + code,
        html: html
      });
      notify('🔑 RÉINITIALISATION MOT DE PASSE\n\nEmail: ' + em + '\nDate: ' + now + '\nIP: ' + ip);
    } catch (err) {
      console.error('Reset email error:', err.message);
    }
    return res.status(200).json({ ok: true, message: 'Si cet email existe, un code de réinitialisation a été envoyé.' });
  }

  // RESET PASSWORD — Verify code and update password
  if (action === 'reset-password') {
    if (!email || !b.code || !b.newPassword) {
      return res.status(400).json({ error: 'Champs manquants' });
    }
    if (b.newPassword.length < 6) {
      return res.status(400).json({ error: 'Minimum 6 caracteres' });
    }
    var em = email.toLowerCase();
    var reset = await rGet('reset:' + em);
    if (!reset) {
      return res.status(400).json({ error: 'Code expiré. Recommencez la réinitialisation.' });
    }
    if (reset.code !== b.code) {
      return res.status(400).json({ error: 'Code incorrect' });
    }
    var u = await rGet('user:' + em);
    if (!u) {
      return res.status(400).json({ error: 'Compte introuvable' });
    }
    u.password = hash(b.newPassword);
    await rSet('user:' + em, u);
    await rDel('reset:' + em);
    notify('✅ MOT DE PASSE RÉINITIALISÉ\n\nEmail: ' + em + '\nDate: ' + now + '\nIP: ' + ip);
    return res.status(200).json({ ok: true, message: 'Mot de passe réinitialisé. Vous pouvez vous connecter.' });
  }

  return res.status(400).json({ error: 'Action inconnue' });
};
