const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { plan, email, firstName, lastName, domain } = req.body;
    
    if (!plan || !email) {
      return res.status(400).json({ error: 'Plan and email required' });
    }
    
    // Price IDs from Stripe Dashboard
    const PRICE_IDS = {
      essentiel: process.env.STRIPE_PRICE_ESSENTIEL || 'price_essentiel_monthly',
      premium: process.env.STRIPE_PRICE_PREMIUM || 'price_premium_monthly'
    };
    
    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return res.status(400).json({ error: 'Invalid plan' });
    }
    
    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: `${req.headers.origin || 'https://maltyshop.vercel.app'}/espace-client.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://maltyshop.vercel.app'}/abonnement.html`,
      metadata: {
        firstName: firstName || '',
        lastName: lastName || '',
        domain: domain || '',
        plan: plan
      },
      subscription_data: {
        metadata: {
          firstName: firstName || '',
          lastName: lastName || '',
          domain: domain || '',
          plan: plan
        }
      }
    });
    
    return res.status(200).json({ url: session.url });
    
  } catch (error) {
    console.error('Stripe error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};