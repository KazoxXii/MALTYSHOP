const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const { notifyNewSubscription, notifyPayment, notifyPaymentFailed } = require('./telegram');

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_LOGIN,
    pass: process.env.BREVO_SMTP_KEY
  }
});

module.exports.config = { api: { bodyParser: false } };

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Send email via Outlook SMTP (free)
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
    console.error('Email send failed:', err.message);
  }
}

function welcomeEmailHtml(name, plan) {
  const features = plan === 'Premium'
    ? '<li>Modifications illimitées</li><li>Support prioritaire 24h</li><li>Suivi SEO mensuel</li><li>Analytics avancés</li>'
    : '<li>3 modifications / mois</li><li>Support prioritaire</li><li>Suivi de site en temps réel</li>';
  const price = plan === 'Premium' ? '39€' : '19€';
  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0f1a;color:#e0e8f0;padding:0;border-radius:16px;overflow:hidden;border:1px solid #1a2a4a;">
    <div style="background:linear-gradient(135deg,#0066ff,#0044cc);padding:40px;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">🚀</div>
      <h1 style="color:#ffffff;font-size:26px;margin:0;font-weight:700;">Bienvenue chez MALTY !</h1>
      <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">Votre abonnement est maintenant actif</p>
    </div>
    <div style="padding:32px 40px;">
      <p style="font-size:16px;margin:0 0 24px;">Bonjour <strong style="color:#ffffff;">${name}</strong>,</p>
      <p style="font-size:15px;color:#b0c4de;margin:0 0 24px;line-height:1.7;">Merci pour votre confiance ! Votre forfait <strong style="color:#0066ff;">${plan}</strong> est activé.</p>

      <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0;color:#6a8cba;font-size:13px;width:120px;">Forfait</td>
            <td style="padding:8px 0;font-weight:600;color:#0066ff;font-size:16px;">${plan}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6a8cba;font-size:13px;">Prix</td>
            <td style="padding:8px 0;font-weight:600;">${price}/mois</td>
          </tr>
        </table>
      </div>

      <div style="background:#0d1a2e;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
        <p style="margin:0 0 12px;font-size:14px;color:#0066ff;font-weight:600;">🚀 Ce qui est inclus :</p>
        <ul style="margin:0;padding-left:20px;">
          ${features}
        </ul>
      </div>

      <div style="text-align:center;margin:32px 0;">
        <a href="https://maltyshop.vercel.app/espace-client.html" style="display:inline-block;background:#0066ff;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">Mon espace client →</a>
      </div>
      <p style="font-size:14px;color:#6a8cba;text-align:center;line-height:1.5;">Besoin d'aide ? Contactez-nous depuis votre espace client.</p>
    </div>
    <div style="background:#0d1525;padding:20px 40px;text-align:center;border-top:1px solid #1a2a4a;">
      <p style="margin:0;font-size:13px;color:#4a6a8a;">— L'équipe MALTY</p>
      <p style="margin:4px 0 0;font-size:11px;color:#3a5a7a;">maltyshop.vercel.app</p>
    </div>
  </div>`;
}

function paymentConfirmationHtml(name, plan, amount) {
  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0f1a;color:#e0e8f0;padding:0;border-radius:16px;overflow:hidden;border:1px solid #1a2a4a;">
    <div style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:40px;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">💳</div>
      <h1 style="color:#ffffff;font-size:26px;margin:0;font-weight:700;">Paiement confirmé</h1>
      <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">Votre paiement a bien été reçu</p>
    </div>
    <div style="padding:32px 40px;">
      <p style="font-size:16px;margin:0 0 24px;">Bonjour <strong style="color:#ffffff;">${name}</strong>,</p>
      <p style="font-size:15px;color:#b0c4de;margin:0 0 24px;line-height:1.7;">Votre paiement a bien été reçu.</p>
      <div style="background:#111f35;border:1px solid #1a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#6a8cba;font-size:13px;width:120px;">Montant</td><td style="padding:8px 0;font-weight:600;color:#22c55e;font-size:18px;">${amount}€</td></tr>
          <tr><td style="padding:8px 0;color:#6a8cba;font-size:13px;">Forfait</td><td style="padding:8px 0;font-weight:600;">${plan}</td></tr>
          <tr><td style="padding:8px 0;color:#6a8cba;font-size:13px;">Prochain</td><td style="padding:8px 0;">Prélèvement dans 30 jours</td></tr>
        </table>
      </div>
      <div style="text-align:center;margin:32px 0;">
        <a href="https://maltyshop.vercel.app/espace-client.html" style="display:inline-block;background:#0066ff;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">Mon espace client →</a>
      </div>
      <p style="font-size:14px;color:#6a8cba;text-align:center;">Merci pour votre confiance !</p>
    </div>
    <div style="background:#0d1525;padding:20px 40px;text-align:center;border-top:1px solid #1a2a4a;">
      <p style="margin:0;font-size:13px;color:#4a6a8a;">— L'équipe MALTY</p>
      <p style="margin:4px 0 0;font-size:11px;color:#3a5a7a;">maltyshop.vercel.app</p>
    </div>
  </div>`;
}

function paymentFailedHtml(name) {
  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0f1a;color:#e0e8f0;padding:0;border-radius:16px;overflow:hidden;border:1px solid #1a2a4a;">
    <div style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:40px;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
      <h1 style="color:#ffffff;font-size:26px;margin:0;font-weight:700;">Paiement échoué</h1>
      <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">Une action est requise</p>
    </div>
    <div style="padding:32px 40px;">
      <p style="font-size:16px;margin:0 0 24px;">Bonjour <strong style="color:#ffffff;">${name}</strong>,</p>
      <p style="font-size:15px;color:#b0c4de;margin:0 0 24px;line-height:1.7;">Nous n'avons pas pu renouveler votre abonnement. Veuillez mettre à jour votre moyen de paiement.</p>
      <div style="background:#2a0f0f;border:1px solid #7f1d1d;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
        <p style="margin:0;font-size:15px;color:#fca5a5;">⚠️ Votre abonnement pourrait être suspendu</p>
      </div>
      <div style="text-align:center;margin:32px 0;">
        <a href="https://maltyshop.vercel.app/espace-client.html" style="display:inline-block;background:#0066ff;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">Mettre à jour mon paiement →</a>
      </div>
      <p style="font-size:14px;color:#6a8cba;text-align:center;">Besoin d'aide ? Contactez-nous.</p>
    </div>
    <div style="background:#0d1525;padding:20px 40px;text-align:center;border-top:1px solid #1a2a4a;">
      <p style="margin:0;font-size:13px;color:#4a6a8a;">— L'équipe MALTY</p>
      <p style="margin:4px 0 0;font-size:11px;color:#3a5a7a;">maltyshop.vercel.app</p>
    </div>
  </div>`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;
  
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('✅ Subscription created:', session.id);
      
      const name = session.metadata?.firstName || session.customer_details?.name || 'Client';
      const email = session.customer_email || session.customer_details?.email;
      const plan = session.metadata?.plan === 'premium' ? 'Premium 39€' : 'Essentiel 19€';
      
      const now = new Date().toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
      
      if (email) {
        await sendEmail('maltyz@outlook.fr', '✅ [Copie] Bienvenue ' + name + ' — ' + plan, welcomeEmailHtml(name, plan));
      }
      await notifyNewSubscription({
        name,
        email: email || 'N/A',
        domain: session.metadata?.domain || 'N/A',
        plan,
        amount: plan === 'Premium 39€' ? '39€' : '19€',
        sessionId: session.id,
        date: now
      });
      break;
    }
    
    case 'invoice.paid': {
      const invoice = event.data.object;
      console.log('💰 Payment received:', invoice.id);
      
      const email = invoice.customer_email;
      const name = invoice.customer_name || 'Client';
      const amount = invoice.amount_paid / 100;
      const plan = invoice.lines?.data?.[0]?.metadata?.plan === 'premium' ? 'Premium' : 'Essentiel';
      
      const now = new Date().toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
      
      if (email) {
        await sendEmail('maltyz@outlook.fr', '💰 [Copie] Paiement ' + amount + '€ — ' + name, paymentConfirmationHtml(name, plan, amount));
      }
      await notifyPayment({
        name,
        email: email || 'N/A',
        plan,
        amount,
        invoiceId: invoice.id,
        invoiceUrl: invoice.hosted_invoice_url || 'N/A',
        date: now
      });
      break;
    }
    
    case 'invoice.payment_failed': {
      const failedInvoice = event.data.object;
      console.log('❌ Payment failed:', failedInvoice.id);
      
      const email = failedInvoice.customer_email;
      const name = failedInvoice.customer_name || 'Client';
      
      const now = new Date().toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
      
      await notifyPaymentFailed({
        name,
        email: email || 'N/A',
        invoiceId: failedInvoice.id,
        invoiceUrl: failedInvoice.hosted_invoice_url || 'N/A',
        date: now
      });
      break;
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      console.log('🗑️ Subscription cancelled:', subscription.id);
      break;
    }
    
    case 'customer.subscription.updated': {
      const updatedSub = event.data.object;
      console.log('🔄 Subscription updated:', updatedSub.id);
      break;
    }
    
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
  
  return res.status(200).json({ received: true });
};