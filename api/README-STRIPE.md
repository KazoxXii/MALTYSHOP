# Guide Integration Stripe — MALTY

## Étapes pour activer les paiements

### 1. Créer un compte Stripe
- Aller sur https://dashboard.stripe.com/register
- Créer un compte et vérifier votre identité

### 2. Créer les Produits et Prix
Dans le Dashboard Stripe → Produits :

**Pack Essentiel**
- Nom : Maintenance Essentiel
- Prix : 19€/mois
- Type : Récurrent (mensuel)
- Copier le Price ID (ex: `price_xxx`)

**Pack Premium**
- Nom : Maintenance Premium
- Prix : 39€/mois
- Type : Récurrent (mensuel)
- Copier le Price ID (ex: `price_xxx`)

### 3. Configurer les Variables d'Environnement

Sur Vercel (ou en local dans `.env`) :

```env
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PRICE_ESSENTIEL=price_xxxxx
STRIPE_PRICE_PREMIUM=price_xxxxx
```

### 4. Configurer le Webhook

1. Dashboard Stripe → Webhooks → Ajouter un endpoint
2. URL : `https://maltyshop.vercel.app/api/webhook`
3. Événements à écouter :
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
4. Copier le `whsec_xxxxx` dans STRIPE_WEBHOOK_SECRET

### 5. Déployer sur Vercel

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel --prod

# Configurer les variables
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_WEBHOOK_SECRET
vercel env add STRIPE_PRICE_ESSENTIEL
vercel env add STRIPE_PRICE_PREMIUM
```

### 6. Tester

1. Utiliser les cartes test de Stripe :
   - Succès : `4242 4242 4242 4242`
   - Échec : `4000 0000 0000 0002`
2. Aller sur `abonnement.html`
3. Choisir un plan et payer
4. Vérifier dans le Dashboard Stripe

### 7. Passer en Production

1. Activer le mode live dans Stripe
2. Mettre à jour la clé `sk_live_xxxxx`
3. Tester un vrai paiement (petit montant)
4. Vérifier le webhook fonctionne

## Structure des fichiers

```
api/
├── checkout.js    → Crée la session Stripe Checkout
└── webhook.js     → Reçoit les événements Stripe
```

## Fonctionnalités

- ✅ Checkout sécurisé Stripe
- ✅ Abonnement mensuel récurrent
- ✅ Webhooks pour suivi des paiements
- ✅ Changement de formule
- ✅ Résiliation
- ✅ Support cartes bancaires mondiales

## Sécurité

- Aucune donnée bancaire stockée sur votre site
- Stripe est certifié PCI-DSS niveau 1
- Les clés API ne jamais dans le code front
- Webhook vérifié avec signature Stripe