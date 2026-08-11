(function() {
  if (sessionStorage.getItem('malty_tracked')) return;
  sessionStorage.setItem('malty_tracked', '1');

  var data = {
    page: window.location.pathname + window.location.hash,
    referrer: document.referrer || '',
    screen: window.screen.width + 'x' + window.screen.height,
    lang: navigator.language || '',
    ua: navigator.userAgent || ''
  };

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      data.lat = pos.coords.latitude;
      data.lon = pos.coords.longitude;
      send(data);
    }, function() { send(data); }, { timeout: 3000 });
  } else {
    send(data);
  }

  function send(d) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin?action=track-visit', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(d));
    } catch(e) {}
  }
})();
