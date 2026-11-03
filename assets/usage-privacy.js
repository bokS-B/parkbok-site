// Basic, opt-in analytics only. This is NOT a certified advertising CMP.
// No Google request (including consent pings) before an affirmative choice.
(function () {
  'use strict';
  var tag = document.currentScript, id = tag && tag.getAttribute('data-ga');
  var hosts = ['parkbok.com', 'www.parkbok.com'];
  var key = 'pb_statistics_v1', ttl = 180 * 86400000, loaded = false, panel, opener, currentChoice;
  var copy = {
    en: ['Analytics settings', 'Help improve PARKBOK?', 'Allow Google Analytics to measure pages, approximate region and tool use with cookies. Files and entered content stay on your device. You can use every tool without analytics.', 'Decline', 'Allow analytics', 'Privacy', 'Saved for 180 days. Change this in the footer.'],
    ko: ['통계 설정', 'PARKBOK 개선에 참여할까요?', '허용하면 Google Analytics가 쿠키로 방문 페이지·대략적인 지역·도구 이용을 측정합니다. 거절해도 모든 도구를 쓸 수 있고, 파일·입력 내용은 전송하지 않습니다.', '거절', '통계 허용', '개인정보', '선택은 180일 저장되며 푸터에서 바꿀 수 있습니다.'],
    ja: ['アクセス解析の設定', 'PARKBOKの改善に協力しますか？', 'Google AnalyticsがCookieを使い、閲覧ページ・おおよその地域・ツールの利用を測定します。ファイルと入力内容は端末内で処理されます。拒否しても全ツールを使えます。', '拒否', '解析を許可', 'プライバシー', '選択は180日間保存され、フッターから変更できます。'],
    zh: ['统计设置', '愿意帮助改进PARKBOK吗？', '允许Google Analytics使用Cookie统计访问页面、大致地区和工具使用情况。文件和输入内容在您的设备上处理。拒绝后仍可使用所有工具。', '拒绝', '允许统计', '隐私政策', '选择保存180天，可在页脚更改。'],
    es: ['Ajustes de estadísticas', '¿Nos ayudas a mejorar PARKBOK?', 'Google Analytics usa cookies para medir páginas, región aproximada y uso de herramientas. Los archivos y el contenido introducido se procesan en tu dispositivo. Todas las herramientas funcionan si rechazas.', 'Rechazar', 'Permitir estadísticas', 'Privacidad', 'Guardado durante 180 días. Puedes cambiarlo en el pie de página.'],
    pt: ['Configurações de estatísticas', 'Ajude a melhorar o PARKBOK?', 'O Google Analytics usa cookies para medir páginas, região aproximada e uso das ferramentas. Arquivos e conteúdo inserido são processados no seu dispositivo. Todas as ferramentas funcionam se você recusar.', 'Recusar', 'Permitir estatísticas', 'Privacidade', 'Salvo por 180 dias. Altere no rodapé.'],
    de: ['Analyseeinstellungen', 'PARKBOK verbessern helfen?', 'Google Analytics misst mit Cookies Seitenaufrufe, ungefähre Region und Werkzeugnutzung. Dateien und eingegebene Inhalte bleiben auf deinem Gerät. Alle Werkzeuge funktionieren auch ohne Analyse.', 'Ablehnen', 'Analyse erlauben', 'Datenschutz', '180 Tage gespeichert. Im Footer jederzeit ändern.'],
    fr: ['Réglages des statistiques', 'Aider à améliorer PARKBOK ?', 'Google Analytics utilise des cookies pour mesurer les pages, la région approximative et l’utilisation des outils. Fichiers et contenu saisi sont traités sur votre appareil. Tous les outils fonctionnent en cas de refus.', 'Refuser', 'Autoriser les statistiques', 'Confidentialité', 'Choix conservé 180 jours, modifiable en bas de page.']
  };
  var lang = (document.documentElement.lang || 'en').split('-')[0], t = copy[lang] || copy.en;
  var production = hosts.indexOf(location.hostname) >= 0;
  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      if (v && (v.choice === 'allow' || v.choice === 'deny') && typeof v.at === 'number' && v.at <= Date.now() && Date.now() - v.at < ttl) return v.choice;
    } catch (_) {}
    return null;
  }
  function removeCookies() {
    try {
      document.cookie.split(';').forEach(function (c) {
        var name = c.split('=')[0].trim();
        if (!/^_ga(?:_|$)/.test(name)) return;
        ['', location.hostname, '.parkbok.com'].forEach(function (domain) {
          document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax' + (domain ? '; Domain=' + domain : '');
        });
      });
    } catch (_) {}
  }
  function start() {
    if (!production || !id) return;
    window['ga-disable-' + id] = false;
    if (loaded) return;
    loaded = true;
    var c = { page_location: location.origin + location.pathname, page_referrer: '', allow_google_signals: false, allow_ad_personalization_signals: false };
    try { c.page_referrer = document.referrer ? new URL(document.referrer).origin + '/' : ''; } catch (_) {}
    try { if (localStorage.getItem('pb_internal') === '1') c.traffic_type = 'internal'; } catch (_) {}
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { if (currentChoice === 'allow') window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    // Global values also protect enhanced measurement and later tool events.
    window.gtag('set', { page_location: c.page_location, page_referrer: c.page_referrer });
    window.gtag('js', new Date());
    window.gtag('config', id, c);
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    s.id = 'pb-statistics-tag'; document.head.appendChild(s);
  }
  function apply(choice) {
    currentChoice = choice;
    if (choice === 'allow') start();
    else { if (id) window['ga-disable-' + id] = true; removeCookies(); }
  }
  function choose(choice) {
    try { localStorage.setItem(key, JSON.stringify({ choice: choice, at: Date.now() })); } catch (_) {}
    apply(choice); panel.hidden = true; document.body.style.removeProperty('--pb-statistics-space');
    if (opener) { opener.focus(); opener = null; }
  }
  function make(tag, text, parent) {
    var e = document.createElement(tag); e.textContent = text; parent.appendChild(e); return e;
  }
  function show() {
    if (!panel) {
      panel = document.createElement('aside'); panel.id = 'pb-statistics'; panel.setAttribute('aria-label', t[0]);
      make('strong', t[1], panel); make('p', t[2], panel);
      var actions = make('div', '', panel); actions.className = 'pb-statistics-actions';
      var no = make('button', t[3], actions), yes = make('button', t[4], actions), link = make('a', t[5], actions);
      no.type = yes.type = 'button'; no.dataset.choice = 'deny'; yes.dataset.choice = 'allow';
      no.onclick = function () { choose('deny'); }; yes.onclick = function () { choose('allow'); };
      link.href = '/privacy.html#statistics'; make('small', t[6], panel);
      document.body.appendChild(panel);
      if (window.ResizeObserver) new ResizeObserver(function () {
        if (!panel.hidden) document.body.style.setProperty('--pb-statistics-space', panel.offsetHeight + 24 + 'px');
      }).observe(panel);
    }
    panel.hidden = false;
    document.body.style.setProperty('--pb-statistics-space', panel.offsetHeight + 24 + 'px');
    if (opener) panel.querySelector('button').focus();
  }
  // Preserve the existing internal marker without sending it in page URLs.
  try {
    var u = new URL(location.href), v = u.searchParams.get('pb_internal');
    if (v === '1' || v === '0') { localStorage.setItem('pb_internal', v); u.searchParams.delete('pb_internal'); history.replaceState(null, '', u.href); }
  } catch (_) {}
  var style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/assets/usage-privacy.css'; document.head.appendChild(style);
  apply(read());
  var foot = document.querySelector('.foot-links');
  if (foot) {
    var button = make('button', t[0], foot); button.type = 'button'; button.className = 'pb-statistics-settings';
    button.onclick = function () { opener = button; show(); };
  }
  window.addEventListener('storage', function (event) {
    if (event.key !== key && event.key !== null) return;
    var choice = read(); apply(choice);
    if (panel && choice) { panel.hidden = true; document.body.style.removeProperty('--pb-statistics-space'); }
    else if (!choice && production) show();
  });
  if (!read() && production) show();
})();
