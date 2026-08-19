/**
 * MALTY Analytics — Real-time tracking script
 * Tracks page views, clicks, devices, referrers
 */
(function() {
  'use strict';

  var API = '/api/analytics';
  var _sent = false;

  function post(action, data) {
    try {
      var xhr = new (window.XMLHttpRequest || ActiveXObject)('MSxml2.XMLHTTP');
      xhr.open('POST', API + '?action=' + action, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(data));
    } catch(e) {}
  }

  // Track page view on load
  function trackPageView() {
    if (_sent) return;
    _sent = true;
    post('track', {
      page: location.pathname + location.hash,
      referrer: document.referrer || '',
      screenWidth: window.innerWidth
    });
  }

  // Track clicks on important elements
  function trackClicks() {
    document.addEventListener('click', function(e) {
      var el = e.target.closest('a, button, [onclick]');
      if (!el) return;
      var label = el.textContent.trim().slice(0, 60) || el.getAttribute('aria-label') || el.tagName;
      var href = el.getAttribute('href') || '';
      post('track-click', {
        element: label + (href ? ' → ' + href.slice(0, 40) : ''),
        page: location.pathname
      });
    }, true);
  }

  // Track scroll depth
  function trackScroll() {
    var maxScroll = 0;
    var thresholds = [25, 50, 75, 100];
    var tracked = {};
    window.addEventListener('scroll', function() {
      var pct = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
      thresholds.forEach(function(t) {
        if (pct >= t && !tracked[t]) {
          tracked[t] = true;
          post('track-click', {
            element: 'scroll_' + t + '%',
            page: location.pathname
          });
        }
      });
    }, { passive: true });
  }

  // Track time on page
  function trackTimeOnPage() {
    var start = Date.now();
    window.addEventListener('beforeunload', function() {
      var seconds = Math.round((Date.now() - start) / 1000);
      if (seconds > 5) {
        post('track-click', {
          element: 'time_' + seconds + 's',
          page: location.pathname
        });
      }
    });
  }

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      trackPageView();
      trackClicks();
      trackScroll();
      trackTimeOnPage();
    });
  } else {
    trackPageView();
    trackClicks();
    trackScroll();
    trackTimeOnPage();
  }
})();
