/* app.js — UI + 번역 API 연동 */
(function () {
  'use strict';

  var LANGS = {
    en: { name: '영어', code: 'en' },
    ceb: { name: '비사야어', code: 'ceb' },
    tl: { name: '따갈로그어', code: 'tl' },
  };

  var EXAMPLES = {
    en: ['tree', 'I love you', 'Good morning', '나무', '감사합니다'],
    ceb: ['Salamat po', 'Maayong buntag', 'Gihigugma tika', '감사합니다', '사랑해요'],
    tl: ['Salamat po', 'Mahal kita', 'Magandang umaga', '감사합니다', '안녕하세요'],
  };

  var currentLang = 'en';

  var $lang = document.getElementById('langButtons');
  var $input = document.getElementById('inputText');
  var $badge = document.getElementById('directionBadge');
  var $examples = document.getElementById('examples');
  var $convert = document.getElementById('convertBtn');
  var $card = document.getElementById('resultCard');
  var $line = document.getElementById('resultLine');
  var $copy = document.getElementById('copyBtn');
  var $pronLabel = document.getElementById('pronLabel');
  var $pron = document.getElementById('pronValue');
  var $meaningLabel = document.getElementById('meaningLabel');
  var $meaning = document.getElementById('meaningValue');
  var $note = document.getElementById('resultNote');

  /* ---------------- 방향 감지 ---------------- */

  function hasHangul(text) {
    return /[가-힣]/.test(text);
  }

  function updateBadge() {
    var name = LANGS[currentLang].name;
    $badge.textContent = hasHangul($input.value) ? '한국어 → ' + name : name + ' → 한국어';
  }

  /* ---------------- 번역 API ---------------- */

  function googleTranslate(text, sl, tl) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' + sl + '&tl=' + tl + '&dt=t&q=' + encodeURIComponent(text);
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || !data[0] || !data[0].length) throw new Error('빈 응답');
      return data[0].map(function (seg) { return seg && seg[0] ? seg[0] : ''; }).join('').trim();
    });
  }

  function myMemoryTranslate(text, sl, tl) {
    var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=' + sl + '%7C' + tl;
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || data.responseStatus !== 200 || !data.responseData || !data.responseData.translatedText) throw new Error('번역 실패');
      return data.responseData.translatedText.trim();
    });
  }

  function translateText(text, sl, tl) {
    return googleTranslate(text, sl, tl).catch(function () {
      return myMemoryTranslate(text, sl, tl);
    });
  }

  /* ---------------- 변환 실행 ---------------- */

  function convert() {
    var text = $input.value.trim();
    if (!text) {
      $input.focus();
      return;
    }

    var lang = LANGS[currentLang];
    var toKorean = !hasHangul(text);
    var pron;

    if (toKorean) {
      // 외국어 → 한글 발음
      pron = Translit.transliterateToHangul(text, currentLang === 'en' ? 'en' : 'fil');
      $pronLabel.textContent = '한국 발음';
      $meaningLabel.textContent = '한국어 뜻';
    } else {
      // 한국어 → 로마자 발음
      pron = Translit.romanizeKorean(text);
      $pronLabel.textContent = '로마자 발음';
      $meaningLabel.textContent = lang.name + ' 뜻';
    }

    $card.classList.remove('hidden');
    $pron.textContent = pron;
    $meaning.textContent = '번역 중…';
    $line.textContent = pron + '/…';
    $note.textContent = '';
    $copy.classList.remove('copied');
    $copy.textContent = '복사';
    $convert.disabled = true;

    var sl = toKorean ? lang.code : 'ko';
    var tl = toKorean ? 'ko' : lang.code;

    translateText(text, sl, tl).then(function (meaning) {
      $meaning.textContent = meaning;
      $line.textContent = pron + '/' + meaning;
    }).catch(function () {
      $meaning.textContent = '(번역 서비스에 연결하지 못했어요)';
      $line.textContent = pron;
      $note.textContent = '발음 변환은 완료했지만, 뜻(번역)을 가져오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
    }).finally(function () {
      $convert.disabled = false;
    });
  }

  /* ---------------- UI 이벤트 ---------------- */

  function renderExamples() {
    $examples.innerHTML = '';
    EXAMPLES[currentLang].forEach(function (ex) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'example-chip';
      btn.textContent = ex;
      btn.addEventListener('click', function () {
        $input.value = ex;
        updateBadge();
        convert();
      });
      $examples.appendChild(btn);
    });
  }

  $lang.addEventListener('click', function (e) {
    var btn = e.target.closest('.lang-btn');
    if (!btn) return;
    currentLang = btn.dataset.lang;
    Array.prototype.forEach.call($lang.querySelectorAll('.lang-btn'), function (b) {
      b.classList.toggle('active', b === btn);
    });
    renderExamples();
    updateBadge();
  });

  $input.addEventListener('input', updateBadge);
  $input.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      convert();
    }
  });

  $convert.addEventListener('click', convert);

  $copy.addEventListener('click', function () {
    var text = $line.textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
      $copy.classList.add('copied');
      $copy.textContent = '복사됨!';
      setTimeout(function () {
        $copy.classList.remove('copied');
        $copy.textContent = '복사';
      }, 1500);
    });
  });

  renderExamples();
  updateBadge();
})();
