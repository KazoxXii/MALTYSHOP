/**
 * POP-UP NOUVEAUTÉS - MALTY
 * À chaque mise à jour du site, ajoute une entrée EN HAUT du tableau ci-dessous
 * (version différente à chaque fois). Les visiteurs verront une pop-up avec ce qui a changé.
 */
window.MALTY_UPDATES = [
  {
    version: 'v2.4',
    date: '11/08/2026',
    title: 'Espace client & sécurité',
    items: [
      'Nouveau menu « Mon compte » : modifiez votre prénom, nom, email, téléphone et entreprise.',
      'Changement de mot de passe directement depuis votre compte.',
      'Formulaire de commande stabilisé : plus aucune erreur réseau.',
      'Tous les comptes ont été déconnectés pour la sécurité (reconnectez-vous).'
    ]
  }
];

(function () {
  var list = window.MALTY_UPDATES || [];
  if (!list.length) return;

  var seen = localStorage.getItem('malty_seen_update') || '';
  if (seen === list[0].version) return;

  var pending = list.filter(function (u) { return u.version !== seen; });

  function style() {
    return '<style>' +
      '.updates-modal{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px}' +
      '.updates-card{width:100%;max-width:520px;max-height:88vh;overflow-y:auto;background:#0e1016;border:1px solid #1e2230;border-radius:16px;padding:32px;position:relative;box-shadow:0 24px 80px rgba(0,0,0,.5);animation:updatesIn .35s cubic-bezier(0.16,1,0.3,1)}' +
      '@keyframes updatesIn{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}' +
      '.updates-close{position:absolute;top:14px;right:18px;background:none;border:none;color:#8b93a3;font-size:1.7rem;cursor:pointer;line-height:1}' +
      '.updates-close:hover{color:#e8eaf0}' +
      '.updates-badge{display:inline-block;background:rgba(37,99,235,.15);border:1px solid rgba(37,99,235,.4);color:#7ea2ff;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.12em;padding:6px 14px;border-radius:100px;margin-bottom:16px}' +
      '.updates-card h3{color:#e8eaf0;font-size:1.35rem;margin:0 0 4px}' +
      '.updates-date{color:#8b93a3;font-size:.8rem;margin:0 0 20px}' +
      '.updates-item{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #1e2230;color:#e0e8f0;font-size:.92rem;line-height:1.5}' +
      '.updates-item:last-child{border-bottom:none}' +
      '.updates-item .dot{color:#00cc66;font-weight:700;flex-shrink:0}' +
      '.updates-btn{width:100%;margin-top:20px;padding:14px;border:none;border-radius:10px;background:#2563eb;color:#fff;font-weight:700;font-size:.95rem;cursor:pointer;transition:background .2s}' +
      '.updates-btn:hover{background:#1d4ed8}' +
      '</style>';
  }

  function build() {
    var latest = list[0];
    var html = style() + '<div class="updates-modal" id="updatesModal"><div class="updates-card">' +
      '<button class="updates-close" id="updatesClose" aria-label="Fermer">&times;</button>' +
      '<span class="updates-badge">🆕 Nouveautés</span>' +
      '<h3>' + latest.title + '</h3>' +
      '<p class="updates-date">' + latest.date + '</p>' +
      '<div>' + pending.map(function (u) {
        return (u.items || []).map(function (it) { return '<div class="updates-item"><span class="dot">✓</span><span>' + it + '</span></div>'; }).join('');
      }).join('') + '</div>' +
      '<button class="updates-btn" id="updatesOk">J\'ai compris</button>' +
      '</div></div>';
    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div);

    function close() {
      localStorage.setItem('malty_seen_update', latest.version);
      if (document.getElementById('updatesModal')) document.getElementById('updatesModal').remove();
    }
    document.getElementById('updatesOk').addEventListener('click', close);
    document.getElementById('updatesClose').addEventListener('click', close);
    document.getElementById('updatesModal').addEventListener('click', function (e) { if (e.target === this) close(); });
  }

  build();
})();
