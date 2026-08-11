/**
 * KNOWLEDGE BASE - MALTY V2
 * Ce fichier centralise toute l'intelligence du site pour garantir la cohérence
 * entre les tarifs, la FAQ et les réponses de l'agent IA.
 */

window.MALTY_CONFIG = {
    // --- CONFIGURATION EXTERNE ---
    // Mets ici l'URL de ton webhook Google Apps Script une fois déployé
    webhookUrl: 'https://script.google.com/macros/s/AKfycbxQEV9C2XvMGJuStVEEBSP8kqCH8zFWUCvsxS1QBiVAkeY77EdxpgQN35Btjpvi20h4/exec',

    // --- CATALOGUE DE PRODUITS WEB ---
    formules: [
        { 
            id: 'landing', 
            nom: 'Pack Landing Page Vendeuse', 
            prix: 99, 
            delai: '3 à 5 jours',
            desc: 'Achetez votre machine à prospects. Une page unique ultra-optimisée pour transformer vos publicités en ventes réelles.',
            features: ['Structure de Vente Psychologique', 'Vitesse Éclair (Score 100)', 'Design Mobile-First', 'Optimisé pour tout Hébergeur', 'Livraison Code Source sous 5j'],
            stripe: 'https://buy.stripe.com/14A8wJ6Jtgd17I48RS0oM05',
            paypal: 'https://paypal.me/Maltyzz/99',
            ventes: 203
        },
        { 
            id: 'portfolio', 
            nom: 'Pack Portfolio d\'Image', 
            prix: 249, 
            delai: '5 à 7 jours',
            desc: 'Achetez votre vitrine de prestige. Le choix des créatifs et freelances qui veulent vendre leurs services avec élégance.',
            features: ['Design Cinématique Premium', 'Galeries Immersives', 'SEO Orienté Image', 'Code Ultra-Léger ES6+', 'Fichiers Prêts à Déployer'],
            stripe: 'https://buy.stripe.com/aFa00d4Bl1i78M8c440oM06',
            paypal: 'https://paypal.me/Maltyzz/249',
            ventes: 89
        },
        { 
            id: 'vitrine', 
            nom: 'Pack Site Vitrine Business', 
            prix: 449, 
            delai: '7 à 10 jours',
            desc: 'Achetez votre autorité digitale. Une présence complète et robuste pour asseoir votre marque et capturer des leads qualifiés.',
            features: ['Multi-pages Stratégiques', 'Architecture SEO Puissante', 'Blog / Actualités intégrés', 'Intégration CRM & Socials', 'Code Source Complet & Pro'],
            stripe: 'https://buy.stripe.com/dRm8wJaZJ8KzgeA4BC0oM07',
            paypal: 'https://paypal.me/Maltyzz/449',
            recommended: true,
            ventes: 127
        },
        { 
            id: 'premium', 
            nom: 'Solution Web Sur-Mesure', 
            prix: 899, 
            delai: '14 à 21 jours',
            desc: 'Achetez l\'excellence totale. Un site unique conçu sans aucune limite technique pour propulser votre business au sommet.',
            features: ['Design Exclusif & Signature', 'SEO Puissance Maximale', 'Fonctionnalités Métier Pro', 'Documentation Déploiement', 'Performance Élite Native'],
            stripe: 'https://buy.stripe.com/7sY9AN8RB8Kz0fC4BC0oM08',
            paypal: 'https://paypal.me/Maltyzz/899',
            ventes: 42
        }
    ],

    // --- FAQ COMPLETE ---
    faq: [
        { 
            q: "Quelles technologies utilisez-vous ?", 
            a: "Je développe majoritairement avec le 'Vanilla Stack' : HTML5, CSS3 pur et JavaScript moderne (ES6+). Pourquoi ? Parce que c'est ce qui offre la meilleure performance, une sécurité maximale et un score Google Lighthouse proche de 100. Pour des besoins spécifiques (e-commerce, dashboard complexe), je peux utiliser React ou Next.js.",
            keywords: ['techno', 'langage', 'code', 'html', 'css', 'js', 'javascript', 'react', 'vanilla']
        },
        { 
            q: "Mon site sera-t-il bien référencé sur Google ?", 
            a: "Oui, l'optimisation SEO (Search Engine Optimization) est intégrée nativement dans mon processus de développement. Je travaille sur la sémantique HTML, la vitesse de chargement, les méta-données et l'optimisation des images pour que votre site plaise autant aux robots de Google qu'à vos clients.",
            keywords: ['seo', 'google', 'referencement', 'trouver', 'position', 'recherche']
        },
        { 
            q: "Le site est-il adapté aux smartphones ?", 
            a: "Absolument. Je travaille en approche 'Mobile-First'. Votre site s'adaptera automatiquement à toutes les résolutions d'écran : smartphones, tablettes, laptops et écrans 4K. C'est ce qu'on appelle le Responsive Design.",
            keywords: ['mobile', 'telephone', 'smartphone', 'tablette', 'responsive', 'ecran']
        },
        { 
            q: "Combien coûte réellement un site ?", 
            a: "Mes prix sont forfaitaires pour la création et le code source : de 99€ pour une Landing Page à 899€ pour une solution Premium complète. Il n'y a pas d'abonnement caché car vous êtes propriétaire de votre code.",
            keywords: ['prix', 'tarif', 'argent', 'cout', 'combien', 'payer', 'mensuel', 'abonnement']
        },
        { 
            q: "Quel est le délai moyen de livraison ?", 
            a: "Tout dépend de la complexité. Une Landing Page est livrée en environ 3 à 5 jours. Un Site Vitrine classique demande 7 à 10 jours. Un projet Premium peut aller jusqu'à 3 semaines selon vos retours et la quantité de contenu.",
            keywords: ['delai', 'temps', 'jour', 'semaine', 'long', 'livraison', 'finir']
        },
        { 
            q: "Gérez-vous l'hébergement et le nom de domaine ?", 
            a: "Non, je me concentre exclusivement sur la création et le développement de votre site web. L'achat du nom de domaine et de l'hébergement reste à votre charge et sous votre entière propriété. Je vous livre les fichiers sources prêts à être mis en ligne sur n'importe quel serveur.",
            keywords: ['hosting', 'heberge', 'serveur', 'ovh', 'netlify', 'vercel', 'hostinger', 'domaine', 'nom']
        },
        { 
            q: "Puis-je modifier moi-même le texte et les photos ?", 
            a: "Oui, sur les formules Portfolio, Vitrine et Premium, je peux installer un CMS (système de gestion de contenu) ultra-simple. Vous pourrez alors mettre à jour vos textes et images sans toucher une seule ligne de code.",
            keywords: ['admin', 'modifier', 'changer', 'contenu', 'cms', 'main', 'autonomie']
        },
        { 
            q: "Comment se déroule le paiement ?", 
            a: "Le paiement s'effectue en une fois au lancement du projet. Vous pouvez régler par Carte Bancaire via Stripe ou via PayPal pour une sécurité totale.",
            keywords: ['paiement', 'payer', 'stripe', 'paypal', 'carte', 'cb', 'securise']
        },
        { 
            q: "Et si je veux changer des choses après la livraison ?", 
            a: "Vous bénéficiez d'une garantie de conformité de 30 jours après la livraison des fichiers pour corriger d'éventuels bugs. Pour des modifications ultérieures, je propose des prestations de mise à jour ponctuelle ou un forfait maintenance sur notre page dédiée.",
            keywords: ['support', 'aide', 'apres', 'maintenance', 'modifier', 'bug']
        },
        { 
            q: "Proposez-vous un service de maintenance ?", 
            a: "Oui ! Consultez notre page Maintenance pour découvrir nos forfaits de maintenance mensuels avec mises à jour de sécurité, backups, support prioritaire et plus.",
            keywords: ['maintenance', 'mensuel', 'abonnement', 'support', 'mise a jour', 'backup', 'securite']
        },
        { 
            q: "Le site est-il sécurisé ?", 
            a: "Oui, je code selon les standards de sécurité les plus stricts. Une fois les fichiers installés sur votre hébergeur avec un certificat SSL, vos données et celles de vos visiteurs seront totalement chiffrées.",
            keywords: ['securite', 'ssl', 'cadenas', 'pirate', 'hacker', 'donnees']
        },
        { 
            q: "Pourquoi vos prix sont-ils si compétitifs ?", 
            a: "En tant qu'indépendant spécialisé dans le développement pur, je n'ai pas de frais d'agence ni de coûts de serveurs à répercuter sur mes clients. Vous payez uniquement pour l'expertise et le code source de votre futur site.",
            keywords: ['pourquoi', 'pas cher', 'bas', 'agence', 'prix']
        },
        { 
            q: "Pourquoi pas WordPress ou Wix ?", 
            a: "WordPress c'est bien pour un blog, mais c'est lent (souvent score 30-60 Lighthouse), la cible #1 des hackers, et vous allez payer des plugins à l'année. Mes sites sont codés à la main : charge en 0.8s, score 100/100, zéro faille de sécurité WordPress, et pas d'abonnement. Vous possédez le code source, pas un abonnement à un éditeur.",
            keywords: ['wordpress', 'wix', 'cms', 'template', 'site builder', 'builder', 'squarespace', 'shopify']
        },
        { 
            q: "Comment se passe la livraison du site ?", 
            a: "Une fois le paiement reçu, je vous envoie un questionnaire pour cadrer le projet (contenu, couleurs, inspirations). Je commence le développement et vous envoie une première preview sous 48h. Vous validez les ajustements au fur et à mesure. À la fin du délai annoncé, je vous livre les fichiers sources prêts à déployer avec une documentation pas à pas. Si besoin, je peux vous accompagner pour la mise en ligne.",
            keywords: ['livraison', 'processus', 'etapes', 'deroule', 'comment ca se passe', 'projet', 'deroulement']
        },
        { 
            q: "Quelle est la garantie ?", 
            a: "Chaque site est livré avec une garantie conformité de 30 jours après livraison. Si un bug, un affichage cassé ou un problème technique survient, je le corrige gratuitement. Cette garantie couvre le code que j'ai livré : pas de surprise, pas de frais cachés. Les modifications d'ajout (nouveau texte, nouvelle page) sont facturées à part, comme pour toute prestation.",
            keywords: ['garantie', 'satisfait', 'rembourse', 'apres vente', 'bug', 'correction', 'sav']
        },
        { 
            q: "Puis-je modifier le site moi-même ?", 
            a: "Oui, sur les packs Portfolio, Vitrine et Premium, je peux installer un CMS ultra-simple qui vous permet de modifier textes et images sans toucher au code. Pour le pack Landing, les modifications se font par mes soins (tarif ponctuel). Je fournis aussi une documentation PDF avec toutes les infos pour gérer votre site (hébergement, FTP, etc.).",
            keywords: ['modifier', 'changer', 'cms', 'admin', 'editer', 'autonome', 'self', 'admin panel']
        }
    ],

    // --- LOGIQUE IA MALTY FREELANCE ---
    ai: {
        intro: "Bonjour ! Je suis Malty, votre développeur web indépendant. Je vends des sites haute-performance livrés clés en main (code source). Quel pack souhaitez-vous acquérir aujourd'hui ?",
        unknown: "En tant que créateur web, je me concentre sur le design et le code de votre futur outil de vente. Pour cette question spécifique, je peux vous orienter vers la meilleure stratégie digitale pour votre business.",
        proactive: " Pour commander votre site et recevoir vos fichiers sources dans les meilleurs délais, je vous suggère de remplir une demande de devis.",
        
        expertKnowledge: [
            {
                category: 'service_coeur',
                keywords: ['faire', 'quoi', 'service', 'travail', 'metier', 'creer', 'conception'],
                response: "Je vends le design et le code source complet de votre site web. Je crée des interfaces rapides et cinématiques que vous pouvez héberger où vous le souhaitez."
            },
            {
                category: 'performance',
                keywords: ['vitesse', 'lent', 'rapide', 'performance', 'chargement', 'score', 'lighthouse'],
                response: "La performance est ma priorité. Les sites que je vends sont optimisés pour charger instantanément, garantissant une expérience utilisateur parfaite une fois mis en ligne par vos soins."
            },
            {
                category: 'seo',
                keywords: ['seo', 'google', 'referencement', 'trouver', 'visibilite'],
                response: "Le code que je vous livre est 'SEO-ready'. La structure technique est pensée pour que Google indexe et positionne votre contenu efficacement dès que votre site est en ligne."
            },
            {
                category: 'support_aide',
                keywords: ['aide', 'aider', 'support', 'apres', 'domaine', 'hebergeur', 'configurer'],
                response: "Mon travail consiste à vous livrer les fichiers de votre site. Je ne fournis pas l'hébergement ni le nom de domaine, mais je peux vous conseiller sur les meilleurs choix pour votre projet."
            },
            {
                category: 'business',
                keywords: ['prix', 'cher', 'budget', 'tarif', 'pourquoi'],
                response: "Mes tarifs sont forfaitaires et directs. Vous achetez un actif numérique de haute qualité (votre site), sans frais de gestion mensuels ou intermédiaires d'agence."
            }
        ],

        getBestResponse: function(userInput) {
            const input = userInput.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            let bestResponse = "";
            let maxScore = 0;

            // 1. Tester la FAQ standard
            window.MALTY_CONFIG.faq.forEach(item => {
                let score = 0;
                item.keywords.forEach(kw => {
                    const normalizedKw = kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    if (input.includes(normalizedKw)) score += normalizedKw.length * 1.5;
                });
                if (score > maxScore) {
                    maxScore = score;
                    bestResponse = item.a;
                }
            });

            // 2. Tester la connaissance Freelance
            this.expertKnowledge.forEach(item => {
                let score = 0;
                item.keywords.forEach(kw => {
                    const normalizedKw = kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    if (input.includes(normalizedKw)) score += normalizedKw.length * 2;
                });
                if (score > maxScore) {
                    maxScore = score;
                    bestResponse = item.response;
                }
            });

            if (maxScore < 4) return this.unknown;
            if (maxScore > 8 && !input.includes('devis')) bestResponse += this.proactive;

            return bestResponse;
        }
    }
};
