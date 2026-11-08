// Manual AdSense placement for the Korean PDF compression page.
(function () {
  'use strict';

  if (location.origin !== 'https://parkbok.com' || location.pathname !== '/pdf/compress/ko/') return;

  const client = 'ca-pub-1415309581345613';
  const slot = '5292267734';
  const loaderId = 'pb-pdf-compress-ads-loader';
  const section = document.getElementById('pb-pdf-compress-ad');
  const unit = section && section.querySelector('ins.adsbygoogle');
  if (!unit || unit.dataset.adClient !== client || unit.dataset.adSlot !== slot || document.getElementById(loaderId)) return;
  const sectionStyle = section.style.cssText;

  const query = new URLSearchParams(location.search);
  function internalVisit() {
    if (query.get('pb_internal') === '1') return true;
    try {
      return localStorage.getItem('pb_internal') === '1';
    } catch (_) {
      return null;
    }
  }

  const internal = internalVisit();
  const forcedMessage = query.has('fc') || query.has('fctype');
  const forcedPreview = query.get('fc') === 'alwaysshow' && query.get('fctype') === 'gdpr';
  const probe = internal === true && (query.get('pb_ad_probe') === '1' || forcedPreview);
  if (!probe && (internal !== false || forcedMessage)) return;

  let loaderReady = false;
  let consentApiReady = false;
  let consentReady = false;
  let tcData;
  let stopped = false;
  let requested = false;

  function pauseAds() {
    (window.adsbygoogle = window.adsbygoogle || []).pauseAdRequests = 1;
    section.hidden = true;
  }

  function queueConsent(key, callback) {
    const cmp = window.googlefc = window.googlefc || {};
    const queue = cmp.callbackQueue = cmp.callbackQueue || [];
    queue.push({ [key]: callback });
  }

  function adConsentAllowsRequest() {
    if (!tcData || typeof tcData.gdprApplies !== 'boolean') return false;
    if (tcData.gdprApplies && !['tcloaded', 'useractioncomplete'].includes(tcData.eventStatus)) return false;
    try {
      const values = window.googlefc.getGoogleConsentModeValues();
      // ConsentModePurposeStatusEnum: GRANTED = 1, NOT_APPLICABLE = 3.
      // UNKNOWN, DENIED, NOT_CONFIGURED and missing values all keep ads paused.
      const adPurposes = [values.adStoragePurposeConsentStatus, values.adUserDataPurposeConsentStatus,
        values.adPersonalizationPurposeConsentStatus];
      return adPurposes.every(value => value === 1 || (!tcData.gdprApplies && value === 3));
    } catch (_) {
      return false;
    }
  }

  function requestAd() {
    if (stopped || !loaderReady || !consentReady) return;
    const allowed = adConsentAllowsRequest();
    if (probe) {
      section.dataset.pbAdCheck = allowed ? 'eligible' : 'blocked';
      return;
    }
    if (internalVisit() !== false || !allowed) {
      if (requested) {
        stopped = true;
        pauseAds();
      }
      return;
    }
    if (requested) return;
    try {
      requested = true;
      section.style.cssText = sectionStyle;
      section.hidden = false;
      window.adsbygoogle.pauseAdRequests = 0;
    } catch (_) {
      pauseAds();
    }
  }

  function addPrivacyControl() {
    const footer = document.querySelector('.foot-links');
    const controlId = 'pb-ad-privacy-settings';
    if (!footer || document.getElementById(controlId) || typeof window.__tcfapi !== 'function') return;

    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'pb-statistics-settings';
    control.id = controlId;
    control.textContent = '광고 개인정보 설정';
    control.hidden = true;
    control.style.display = 'none';
    control.addEventListener('click', function () {
      // A stale consent callback must not restart advertising after the message is reopened.
      // The next page load reads the new decision from Google's CMP.
      stopped = true;
      pauseAds();
      try {
        queueConsent('CONSENT_API_READY', function () {
          try {
            window.googlefc.showRevocationMessage();
          } catch (_) { /* Keep advertising paused when the CMP is unavailable. */ }
        });
      } catch (_) { /* Keep advertising paused when the CMP is unavailable. */ }
    });
    footer.appendChild(control);

    try {
      window.__tcfapi('addEventListener', 2, function (data, success) {
        tcData = success ? data : null;
        control.hidden = !success || !data || data.gdprApplies !== true ||
          typeof window.googlefc.showRevocationMessage !== 'function';
        control.style.display = control.hidden ? 'none' : '';
        if (requested && (!success || !data || data.eventStatus === 'cmpuishown' ||
          (data.eventStatus === 'useractioncomplete' && !adConsentAllowsRequest()))) {
          stopped = true;
          pauseAds();
        }
        requestAd();
      });
    } catch (_) { /* Leave the control hidden if the TCF API is unavailable. */ }
  }

  function loadConsentTag() {
    if (stopped || window.top !== window || window.frames.googlefcPresent ||
      consentApiReady || consentReady) return;

    // The account's Google Privacy & messaging tag also starts the certified CMP
    // when the standard AdSense loader has not started it. A TCF stub can exist
    // without a CMP, so wait for Google's own markers. Ads stay paused here.
    const marker = document.createElement('iframe');
    marker.name = 'googlefcPresent';
    marker.hidden = true;
    marker.tabIndex = -1;
    marker.setAttribute('aria-hidden', 'true');
    document.body.appendChild(marker);

    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://fundingchoicesmessages.google.com/i/' + client.slice(3) + '?ers=1';
    if (probe && forcedPreview) tag.src += '&fc=alwaysshow&fctype=gdpr';
    document.head.appendChild(tag);
  }

  pauseAds();
  try {
    queueConsent('CONSENT_MODE_DATA_READY', function () {
      consentReady = true;
      requestAd();
    });
    queueConsent('CONSENT_API_READY', function () {
      consentApiReady = true;
      if (probe) section.dataset.pbAdApi = 'ready';
      addPrivacyControl();
    });
    // Google's async tag supports registering a slot while ad requests are paused.
    // Keep its width measurable for responsive sizing without showing an empty box.
    section.style.maxHeight = '0';
    section.style.overflow = 'hidden';
    section.style.visibility = 'hidden';
    section.style.marginBlock = '0';
    section.hidden = false;
    window.adsbygoogle.push({});
    if (probe) section.dataset.pbAdCheck = 'queued-paused';
  } catch (_) {
    pauseAds();
    return;
  }

  const loader = document.createElement('script');
  loader.id = loaderId;
  loader.async = true;
  loader.crossOrigin = 'anonymous';
  loader.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + client;
  loader.addEventListener('load', function () {
    loaderReady = true;
    requestAd();
    setTimeout(loadConsentTag, 1500);
  });
  loader.addEventListener('error', function () {
    stopped = true;
    pauseAds();
    if (probe) section.dataset.pbAdCheck = 'loader-error';
  });
  document.head.appendChild(loader);
})();
