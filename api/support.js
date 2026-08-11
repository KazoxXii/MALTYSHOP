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

// ==================== BRIEF ====================

function briefEmailToMalty(data) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0f1a;color:#e0e8f0;padding:40px;border-radius:12px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="background:#0066ff;width:60px;height:60px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#fff;">M</div>
    </div>
    <h1 style="color:#00cc66;font-size:22px;text-align:center;margin-bottom:8px;">📋 Nouveau brief client</h1>
    <p style="color:#6a8cba;text-align:center;margin-bottom:32px;">Un client a rempli le formulaire brief pour une Landing Page.</p>

    <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="font-size:14px;color:#0066ff;margin-bottom:16px;">🏢 IDENTITÉ</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;width:140px;">Commerce</td><td style="padding:6px 0;font-weight:600;">${data.businessName || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Gérant</td><td style="padding:6px 0;">${data.ownerName || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Activité</td><td style="padding:6px 0;">${data.activity || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;vertical-align:top;">Description</td><td style="padding:6px 0;line-height:1.5;">${(data.description || '—').replace(/\n/g, '<br>')}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;vertical-align:top;">Différenciation</td><td style="padding:6px 0;line-height:1.5;">${(data.differentiators || '—').replace(/\n/g, '<br>')}</td></tr>
      </table>
    </div>

    <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="font-size:14px;color:#0066ff;margin-bottom:16px;">📍 CONTACT</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;width:140px;">Téléphone</td><td style="padding:6px 0;"><a href="tel:${data.phone}" style="color:#0066ff;text-decoration:none;">${data.phone || '—'}</a></td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Email</td><td style="padding:6px 0;"><a href="mailto:${data.email}" style="color:#0066ff;text-decoration:none;">${data.email || '—'}</a></td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Adresse</td><td style="padding:6px 0;">${data.address || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Zone</td><td style="padding:6px 0;">${data.zone || '—'}</td></tr>
      </table>
    </div>

    <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="font-size:14px;color:#0066ff;margin-bottom:16px;">🛠️ SERVICES</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;width:140px;vertical-align:top;">Prestations</td><td style="padding:6px 0;line-height:1.6;">${(data.services || '—').replace(/\n/g, '<br>')}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Durée moyenne</td><td style="padding:6px 0;">${data.duration || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Capacité/jour</td><td style="padding:6px 0;">${data.capacity || '—'}</td></tr>
      </table>
    </div>

    <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="font-size:14px;color:#0066ff;margin-bottom:16px;">📅 RÉSERVATION</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;width:140px;vertical-align:top;">Horaires</td><td style="padding:6px 0;line-height:1.6;">${(data.hours || '—').replace(/\n/g, '<br>')}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Méthode</td><td style="padding:6px 0;">${data.reservationMethod || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">RDV en ligne</td><td style="padding:6px 0;">${data.wantBooking || '—'}</td></tr>
      </table>
    </div>

    <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="font-size:14px;color:#0066ff;margin-bottom:16px;">📸 IMAGES</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;width:140px;">Réalisations</td><td style="padding:6px 0;">${data.filesRealisations && data.filesRealisations.length ? data.filesRealisations.length + ' fichier(s)' : '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Local</td><td style="padding:6px 0;">${data.filesLocal && data.filesLocal.length ? data.filesLocal.join(', ') : '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Logo</td><td style="padding:6px 0;">${data.filesLogo && data.filesLogo.length ? data.filesLogo.join(', ') : '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Lien photos</td><td style="padding:6px 0;">${data.photosLink || '—'}</td></tr>
      </table>
    </div>

    <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="font-size:14px;color:#0066ff;margin-bottom:16px;">🌐 ONLINE</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;width:140px;">Instagram</td><td style="padding:6px 0;">${data.has_instagram ? '✅' : '❌'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Facebook</td><td style="padding:6px 0;">${data.has_facebook ? '✅' : '❌'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Site existant</td><td style="padding:6px 0;">${data.has_website ? '✅' : '❌'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Google My Business</td><td style="padding:6px 0;">${data.has_gmb ? '✅' : '❌'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Liens</td><td style="padding:6px 0;">${data.existingLinks || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Couleurs</td><td style="padding:6px 0;">${data.colors || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;vertical-align:top;">Remarques</td><td style="padding:6px 0;">${data.remarks || '—'}</td></tr>
      </table>
    </div>

    <div style="text-align:center;">
      <a href="mailto:${data.email}?subject=Re: Brief Landing Page — MALTY" style="display:inline-block;background:#0066ff;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Répondre au client</a>
    </div>
    <p style="color:#6a8cba;font-size:11px;text-align:center;margin-top:32px;">— MALTY Brief</p>
  </div>`;
}

function briefConfirmationToClient(data) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0f1a;color:#e0e8f0;padding:40px;border-radius:12px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="background:#0066ff;width:60px;height:60px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#fff;">M</div>
    </div>
    <h1 style="color:#00cc66;font-size:22px;text-align:center;margin-bottom:8px;">✅ Brief envoyé !</h1>
    <p style="color:#6a8cba;text-align:center;margin-bottom:32px;">Bonjour ${data.ownerName || data.businessName || 'Client'}, j'ai bien reçu votre brief pour la landing page.</p>

    <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="font-size:14px;color:#0066ff;margin-bottom:16px;">📋 Récapitulatif</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;width:120px;">Commerce</td><td style="padding:6px 0;font-weight:600;">${data.businessName || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Activité</td><td style="padding:6px 0;">${data.activity || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6a8cba;font-size:13px;">Pack</td><td style="padding:6px 0;font-weight:600;color:#0066ff;">Landing Page — 99€</td></tr>
      </table>
    </div>

    <div style="background:#0d1a2e;border-left:4px solid #0066ff;padding:16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;">📅 <strong>Délai de livraison :</strong> 3 à 5 jours ouvrés</p>
    </div>

    <p style="color:#6a8cba;font-size:13px;text-align:center;">Je commence la création de votre page. Vous recevrez un email une fois terminé.</p>
    <p style="color:#6a8cba;font-size:11px;text-align:center;margin-top:24px;">— MALTY</p>
  </div>`;
}

function notifyBriefTelegram(data) {
  const services = data.services ? data.services.substring(0, 300) : '—';
  const hours = data.hours ? data.hours.substring(0, 150) : '—';
  return sendTelegram(
    `📋 NOUVEAU BRIEF CLIENT\n\n` +
    `🏢 Commerce: ${data.businessName || '—'}\n` +
    `👤 Gérant: ${data.ownerName || '—'}\n` +
    `📞 Tel: ${data.phone || '—'}\n` +
    `📧 Email: ${data.email || '—'}\n` +
    `📍 Adresse: ${data.address || '—'}\n\n` +
    `🚗 Activité: ${data.activity || '—'}\n` +
    `💡 Différenciation: ${(data.differentiators || '—').substring(0, 150)}\n\n` +
    `🛠️ Services:\n${services}\n\n` +
    `📅 Horaires:\n${hours}\n\n` +
    `📸 Photos: ${data.filesRealisations ? data.filesRealisations.length + ' fichier(s)' : '—'}\n` +
    `🏪 Local: ${data.filesLocal && data.filesLocal.length ? data.filesLocal.join(', ') : '—'}\n` +
    `🎨 Logo: ${data.filesLogo && data.filesLogo.length ? data.filesLogo.join(', ') : '—'}\n\n` +
    `🌐 IG: ${data.has_instagram ? '✅' : '❌'} | FB: ${data.has_facebook ? '✅' : '❌'} | Site: ${data.has_website ? '✅' : '❌'}\n\n` +
    `⚡ Action: Créer la landing page`
  );
}

// ==================== SUPPORT ====================

function supportEmailToMalty(nom, email, type, site, message) {
  const typeEmoji = {
    'Bug / Problème technique': '🐛',
    'Modification de contenu': '✏️',
    'Demande de devis': '📦',
    'Facturation / Abonnement': '💳',
    'Déploiement / Mise en ligne': '🚀',
    'Autre': '💡'
  };

  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0f1a;color:#e0e8f0;padding:40px;border-radius:12px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="background:#0066ff;width:60px;height:60px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#fff;">M</div>
    </div>
    <h1 style="color:#0066ff;font-size:22px;text-align:center;margin-bottom:8px;">${typeEmoji[type] || '📩'} Nouvelle demande support</h1>
    <p style="color:#6a8cba;text-align:center;margin-bottom:32px;">Un client vous a contacté depuis la page support.</p>
    <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6a8cba;font-size:13px;width:120px;">Nom</td><td style="padding:8px 0;font-weight:600;">${nom}</td></tr>
        <tr><td style="padding:8px 0;color:#6a8cba;font-size:13px;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#0066ff;text-decoration:none;">${email}</a></td></tr>
        <tr><td style="padding:8px 0;color:#6a8cba;font-size:13px;">Type</td><td style="padding:8px 0;font-weight:600;">${type}</td></tr>
        <tr><td style="padding:8px 0;color:#6a8cba;font-size:13px;">Site</td><td style="padding:8px 0;">${site || 'Non précisé'}</td></tr>
        <tr><td style="padding:8px 0;color:#6a8cba;font-size:13px;vertical-align:top;">Message</td><td style="padding:8px 0;line-height:1.6;">${message.replace(/\n/g, '<br>')}</td></tr>
      </table>
    </div>
    <div style="text-align:center;">
      <a href="mailto:${email}?subject=Re: Demande support — MALTY" style="display:inline-block;background:#0066ff;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Répondre au client</a>
    </div>
    <p style="color:#6a8cba;font-size:11px;text-align:center;margin-top:32px;">— MALTY Support</p>
  </div>`;
}

function supportConfirmationToClient(nom, type, message) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0f1a;color:#e0e8f0;padding:40px;border-radius:12px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="background:#0066ff;width:60px;height:60px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#fff;">M</div>
    </div>
    <h1 style="color:#00cc66;font-size:22px;text-align:center;margin-bottom:8px;">✅ Message envoyé</h1>
    <p style="color:#6a8cba;text-align:center;margin-bottom:32px;">Bonjour ${nom}, j'ai bien reçu votre message.</p>
    <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6a8cba;font-size:13px;width:120px;">Type</td><td style="padding:8px 0;font-weight:600;">${type}</td></tr>
        <tr><td style="padding:8px 0;color:#6a8cba;font-size:13px;vertical-align:top;">Message</td><td style="padding:8px 0;line-height:1.6;">${message.replace(/\n/g, '<br>')}</td></tr>
      </table>
    </div>
    <div style="background:#0d1a2e;border-left:4px solid #0066ff;padding:16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;">📅 <strong>Délai de réponse :</strong> Sous 24 heures</p>
    </div>
    <p style="color:#6a8cba;font-size:13px;text-align:center;">— MALTY</p>
  </div>`;
}

function notifySupportTelegram(data, requestId) {
  const typeEmoji = {
    'Bug / Problème technique': '🐛',
    'Modification de contenu': '✏️',
    'Demande de devis': '📦',
    'Facturation / Abonnement': '💳',
    'Déploiement / Mise en ligne': '🚀',
    'Autre': '💡'
  };
  const { acceptButton } = require('./telegram');
  return sendTelegram(
    `${typeEmoji[data.type] || '📩'} DEMANDE SUPPORT\n\n` +
    `👤 Nom: ${data.nom}\n` +
    `📧 Email: ${data.email}\n` +
    `📂 Type: ${data.type}\n` +
    `🌐 Site: ${data.site || 'Non précisé'}\n` +
    `💬 Message:\n${data.message.substring(0, 400)}\n\n` +
    `📅 Date: ${data.date}\n` +
    `⚡ Action requise`,
    requestId ? acceptButton(requestId) : undefined
  );
}

// ==================== HANDLER ====================

module.exports = async function handler(req, res) {
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
  const source = data.source || 'support';
  const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  try {
    if (source === 'brief.html') {
      // BRIEF SUBMISSION
      if (!data.businessName || !data.email) {
        return res.status(400).json({ error: 'Champs manquants' });
      }

      // Save to Redis FIRST
      try {
        const briefMsg = 'Projet: ' + (data.businessName || '') + ' | Type: ' + (data.siteType || '') + ' | Pages: ' + (data.pages || '') + ' | Budget: ' + (data.budget || '') + ' | Description: ' + (data.description || '');
        await saveRequest({
          nom: data.businessName,
          email: data.email,
          type: 'Brief — Landing Page',
          site: data.businessName || '',
          message: briefMsg,
          date: now
        });
      } catch (e) {
        console.error('Redis save error:', e.message);
      }

      // Confirmation to client
      try {
        await sendEmail(
          data.email,
          `✅ [MALTY] Votre brief a bien été envoyé`,
          briefConfirmationToClient(data)
        );
      } catch (e) {
        console.error('Email client error:', e.message);
      }

      // Telegram
      try {
        await notifyBriefTelegram(data);
      } catch (e) {
        console.error('Telegram error:', e.message);
      }

      return res.status(200).json({ ok: true, message: 'Brief envoyé' });

    } else {
      // SUPPORT SUBMISSION
      if (!data.nom || !data.email || !data.type || !data.message) {
        return res.status(400).json({ error: 'Champs manquants' });
      }

      // Save to Redis FIRST
      var savedId = null;
      try {
        var saved = await saveRequest({ nom: data.nom, email: data.email, type: data.type, site: data.site || '', message: data.message, date: now });
        savedId = saved ? saved.id : null;
      } catch (e) {
        console.error('Redis save error:', e.message);
      }

      // Confirmation to client
      try {
        await sendEmail(
          data.email,
          `✅ [MALTY] Votre message a bien été envoyé`,
          supportConfirmationToClient(data.nom, data.type, data.message)
        );
      } catch (e) {
        console.error('Email client error:', e.message);
      }

      // Telegram with Accept button
      try {
        await notifySupportTelegram({ ...data, date: now }, savedId);
      } catch (e) {
        console.error('Telegram error:', e.message);
      }

      return res.status(200).json({ ok: true, message: 'Demande envoyée' });
    }
  } catch (err) {
    console.error('Support API error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
