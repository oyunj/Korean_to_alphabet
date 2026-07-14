/*
 * translit.js — 한글 음역/로마자 변환 로직 (브라우저 + Node 공용)
 *
 *  - transliterateToHangul(text, lang) : 영어/따갈로그어/비사야어 → 한글 발음 표기
 *  - romanizeKorean(text)              : 한국어 → 로마자 (국어의 로마자 표기법 기반)
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 한글 자모 조합                                                       */
  /* ------------------------------------------------------------------ */

  var CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
  var JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  function composeSyllable(cho, jung, jong) {
    var ci = CHO.indexOf(cho);
    var ji = JUNG.indexOf(jung);
    var gi = JONG.indexOf(jong || '');
    if (ci < 0 || ji < 0 || gi < 0) return '';
    return String.fromCharCode(0xac00 + (ci * 21 + ji) * 28 + gi);
  }

  /* ------------------------------------------------------------------ */
  /* 음소 토큰                                                            */
  /* ------------------------------------------------------------------ */
  // C: 자음 { j: 초성 자모, coda: 받침 자모(가능할 때), son: 공명음(받침 항상 허용),
  //          stop: 파열음, dbl: 모음 사이에서 ㄹㄹ 겹침, drop: 모음 뒤 r 탈락(영어),
  //          shy: 항상 y 활음 동반(sh), eps: 뒤에 모음이 없을 때 붙일 삽입 모음 }
  // V: 모음 { j: 중성 자모, long: 장모음/이중모음 여부 }
  // G: 활음 { g: 'y' | 'w' }
  // NG: 받침 ㅇ (ng)

  function C(j, o) {
    o = o || {};
    return { t: 'C', j: j, coda: o.coda || null, son: !!o.son, stop: !!o.stop, dbl: !!o.dbl, drop: !!o.drop, shy: !!o.shy, eps: o.eps || 'ㅡ' };
  }
  function V(j, long) { return { t: 'V', j: j, long: !!long }; }
  function G(g) { return { t: 'G', g: g }; }
  function NG() { return { t: 'NG' }; }

  /* ------------------------------------------------------------------ */
  /* 음소열 → 한글 음절                                                    */
  /* ------------------------------------------------------------------ */

  var Y_GLIDE = { 'ㅏ': 'ㅑ', 'ㅐ': 'ㅒ', 'ㅓ': 'ㅕ', 'ㅔ': 'ㅖ', 'ㅗ': 'ㅛ', 'ㅜ': 'ㅠ', 'ㅡ': 'ㅠ', 'ㅣ': 'ㅣ' };
  var W_GLIDE = { 'ㅏ': 'ㅘ', 'ㅐ': 'ㅙ', 'ㅓ': 'ㅝ', 'ㅔ': 'ㅞ', 'ㅣ': 'ㅟ', 'ㅗ': 'ㅘ', 'ㅜ': 'ㅜ', 'ㅡ': 'ㅜ' };

  // opts.freeStopCoda: 파열음 받침을 장모음 뒤에도 허용(필리핀어 계열)
  function tokensToHangul(tokens, opts) {
    opts = opts || {};
    var out = [];
    var n = tokens.length;
    var i = 0;

    function isV(t) { return t && t.t === 'V'; }
    function isG(t) { return t && t.t === 'G'; }
    function vowelAhead(k) {
      return isV(tokens[k]) || (isG(tokens[k]) && isV(tokens[k + 1]));
    }
    function push(cho, jung, jong) { out.push({ cho: cho, jung: jung, jong: jong || '' }); }
    function last() { return out[out.length - 1]; }

    // 방금 만든 음절(모음 v로 끝남)에 받침을 붙이거나 ㄹㄹ 겹침 처리
    function afterVowel(v) {
      var next = tokens[i];
      if (!next) return;
      if (next.t === 'NG' && !vowelAhead(i + 1)) { last().jong = 'ㅇ'; i++; return; }
      if (next.t !== 'C') return;
      if (vowelAhead(i + 1)) {
        // 모음 사이의 단독 ㄹ(l) → 앞 음절에 ㄹ 받침 추가 (살라맛, 헬로)
        if (next.dbl && next.j === 'ㄹ' && !last().jong) last().jong = 'ㄹ';
        return;
      }
      if (next.drop) { i++; return; } // 영어: 모음 뒤 r 탈락 (car → 카)
      if (next.coda && (next.son || !next.stop || opts.freeStopCoda || !v.long)) {
        last().jong = next.coda;
        i++;
      }
    }

    while (i < n) {
      var tok = tokens[i];

      if (tok.t === 'NG') {
        if (last() && !last().jong) last().jong = 'ㅇ';
        else push('ㅇ', 'ㅡ', 'ㅇ');
        i++;
        continue;
      }

      if (tok.t === 'C') {
        if (vowelAhead(i + 1)) {
          i++;
          var g = null;
          if (isG(tokens[i])) { g = tokens[i].g; i++; }
          if (tok.shy && !g) g = 'y';
          var v = tokens[i]; i++;
          var jung = v.j;
          if (g) jung = (g === 'y' ? Y_GLIDE : W_GLIDE)[v.j] || v.j;
          push(tok.j, jung, '');
          afterVowel(v);
        } else {
          if (tok.drop && last()) { i++; continue; }
          push(tok.j, tok.eps, '');
          i++;
        }
        continue;
      }

      if (tok.t === 'G') {
        if (isV(tokens[i + 1])) {
          var v2 = tokens[i + 1];
          var jung2 = (tok.g === 'y' ? Y_GLIDE : W_GLIDE)[v2.j] || v2.j;
          i += 2;
          push('ㅇ', jung2, '');
          afterVowel(v2);
        } else {
          push('ㅇ', tok.g === 'y' ? 'ㅣ' : 'ㅜ', '');
          i++;
        }
        continue;
      }

      if (tok.t === 'V') {
        i++;
        push('ㅇ', tok.j, '');
        afterVowel(tok);
        continue;
      }

      i++;
    }

    var s = '';
    for (var k = 0; k < out.length; k++) s += composeSyllable(out[k].cho, out[k].jung, out[k].jong);
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* 따갈로그어 / 비사야어(세부아노) → 한글                                  */
  /* 철자가 발음과 거의 일치하므로 규칙 변환. 무성 파열음 p/t/k는 된소리 표기    */
  /* (Salamat po → 살라맛 뽀, Tagalog → 따갈로그)                           */
  /* ------------------------------------------------------------------ */

  var FIL_VOWEL = { a: 'ㅏ', e: 'ㅔ', i: 'ㅣ', o: 'ㅗ', u: 'ㅜ' };
  var FIL_CONS = {
    b: C('ㅂ'),
    k: C('ㄲ', { coda: 'ㄱ', stop: true }),
    d: C('ㄷ'),
    g: C('ㄱ'), // 유성음 b/d/g는 받침 대신 브/드/그 (Tagalog → 따갈로그)
    h: C('ㅎ'),
    l: C('ㄹ', { coda: 'ㄹ', son: true, dbl: true }),
    m: C('ㅁ', { coda: 'ㅁ', son: true }),
    n: C('ㄴ', { coda: 'ㄴ', son: true }),
    p: C('ㅃ', { coda: 'ㅂ', stop: true }),
    r: C('ㄹ'),
    s: C('ㅅ'),
    t: C('ㄸ', { coda: 'ㅅ', stop: true }),
    v: C('ㅂ'),
    f: C('ㅍ'),
    j: C('ㅈ', { eps: 'ㅣ' }),
    z: C('ㅈ'),
  };

  function filipinoWordToTokens(word) {
    var w = word.toLowerCase();
    var toks = [];
    var i = 0;
    while (i < w.length) {
      var two = w.slice(i, i + 2);
      var ch = w[i];
      if (two === 'ng') { toks.push(NG()); i += 2; continue; }
      if (two === 'ts') { toks.push(C('ㅊ', { eps: 'ㅣ' })); i += 2; continue; }
      if (two === 'qu' && FIL_VOWEL[w[i + 2]]) { toks.push(FIL_CONS.k, G('w')); i += 2; continue; }
      if (FIL_VOWEL[ch]) { toks.push(V(FIL_VOWEL[ch])); i++; continue; }
      if (ch === 'y') { toks.push(G('y')); i++; continue; }
      if (ch === 'w') { toks.push(G('w')); i++; continue; }
      if (ch === 'c') { toks.push('ei'.indexOf(w[i + 1]) >= 0 ? FIL_CONS.s : FIL_CONS.k); i++; continue; }
      if (ch === 'q') { toks.push(FIL_CONS.k); i++; continue; }
      if (ch === 'x') { toks.push(FIL_CONS.k, FIL_CONS.s); i++; continue; }
      if (ch === w[i - 1] && !FIL_VOWEL[ch]) { i++; continue; } // 겹자음은 한 번만
      if (FIL_CONS[ch]) { toks.push(FIL_CONS[ch]); i++; continue; }
      i++; // 그 밖의 문자(아포스트로피 등)는 무시
    }
    return toks;
  }

  /* ------------------------------------------------------------------ */
  /* 영어 → 한글 (규칙 기반 근사 + 자주 쓰는 단어 예외 사전)                  */
  /* ------------------------------------------------------------------ */

  var EN_CONS = {
    b: C('ㅂ'),
    d: C('ㄷ'),
    g: C('ㄱ'),
    p: C('ㅍ', { coda: 'ㅂ', stop: true }),
    t: C('ㅌ', { coda: 'ㅅ', stop: true }),
    k: C('ㅋ', { coda: 'ㄱ', stop: true }),
    m: C('ㅁ', { coda: 'ㅁ', son: true }),
    n: C('ㄴ', { coda: 'ㄴ', son: true }),
    l: C('ㄹ', { coda: 'ㄹ', son: true, dbl: true }),
    r: C('ㄹ', { drop: true }),
    s: C('ㅅ'),
    z: C('ㅈ'),
    f: C('ㅍ'),
    v: C('ㅂ'),
    h: C('ㅎ'),
    j: C('ㅈ', { eps: 'ㅣ' }),
    ch: C('ㅊ', { eps: 'ㅣ' }),
    sh: C('ㅅ', { shy: true, eps: 'ㅣ' }),
    th: C('ㅅ'),
  };

  // 자주 쓰는 단어는 관용 표기를 그대로 사용
  var EN_WORDS = {
    a: '어', an: '언', the: '더', i: '아이', you: '유', he: '히', she: '쉬', we: '위', they: '데이', it: '잇',
    me: '미', him: '힘', her: '허', them: '뎀', my: '마이', your: '유어', his: '히즈', its: '이츠', our: '아워',
    this: '디스', that: '댓', these: '디즈', those: '도즈', there: '데어', here: '히어', where: '웨어',
    what: '왓', who: '후', why: '와이', how: '하우', which: '위치', when: '웬',
    is: '이즈', am: '앰', are: '아', was: '워즈', were: '워', be: '비', been: '빈', being: '비잉',
    do: '두', does: '더즈', did: '디드', have: '해브', has: '해즈', had: '해드',
    will: '윌', would: '우드', can: '캔', could: '쿠드', should: '슈드', must: '머스트', may: '메이',
    of: '오브', to: '투', in: '인', on: '온', at: '앳', by: '바이', with: '위드', from: '프롬',
    for: '포', about: '어바웃', into: '인투', over: '오버', under: '언더', again: '어게인',
    and: '앤드', or: '오어', but: '벗', not: '낫', no: '노', yes: '예스', so: '소', if: '이프', because: '비커즈',
    one: '원', two: '투', three: '쓰리', four: '포', five: '파이브', six: '식스', seven: '세븐', eight: '에잇',
    nine: '나인', ten: '텐', first: '퍼스트', once: '원스',
    hello: '헬로', hi: '하이', bye: '바이', goodbye: '굿바이', please: '플리즈', sorry: '쏘리',
    thank: '땡크', thanks: '땡스', welcome: '웰컴', okay: '오케이', ok: '오케이',
    good: '굿', bad: '배드', great: '그레이트', nice: '나이스', beautiful: '뷰티풀', happy: '해피',
    love: '러브', like: '라이크', want: '원트', need: '니드', know: '노우', think: '씽크', say: '세이',
    said: '세드', go: '고', come: '컴', see: '시', look: '룩', get: '겟', give: '기브', take: '테이크',
    make: '메이크', eat: '잇', drink: '드링크', sleep: '슬립', work: '워크', play: '플레이', read: '리드',
    write: '라이트', walk: '워크', talk: '토크', live: '리브', laugh: '래프', learn: '런', study: '스터디',
    people: '피플', person: '퍼슨', man: '맨', woman: '우먼', women: '위민', men: '멘', boy: '보이',
    girl: '걸', friend: '프렌드', family: '패밀리', mother: '마더', father: '파더', house: '하우스',
    home: '홈', school: '스쿨', world: '월드', water: '워터', food: '푸드', money: '머니',
    time: '타임', day: '데이', night: '나이트', morning: '모닝', year: '이어', month: '먼스', week: '위크',
    today: '투데이', tomorrow: '투모로우', now: '나우', name: '네임', word: '워드', number: '넘버',
    little: '리틀', long: '롱', old: '올드', new: '뉴', many: '메니', much: '머치', more: '모어',
    most: '모스트', some: '섬', any: '애니', all: '올', very: '베리', too: '투', only: '온리',
    other: '아더', another: '어나더', same: '세임', different: '디퍼런트', right: '라이트', left: '레프트',
    up: '업', down: '다운', out: '아웃', away: '어웨이', through: '스루', around: '어라운드',
    heart: '하트', eye: '아이', earth: '어스', air: '에어', bird: '버드', orange: '오렌지',
    use: '유즈', early: '얼리', move: '무브', answer: '앤서', picture: '픽처',
    computer: '컴퓨터', music: '뮤직', chocolate: '초콜릿', banana: '바나나', coffee: '커피',
    phone: '폰', movie: '무비', city: '시티', country: '컨트리', busy: '비지', company: '컴퍼니',
    england: '잉글랜드', english: '잉글리시', korea: '코리아', korean: '코리안', america: '아메리카',
  };

  var EN_VOWELS = { a: 'ㅐ', e: 'ㅔ', i: 'ㅣ', o: 'ㅗ', u: 'ㅓ' };
  var MAGIC_E = { a: 'A', i: 'I', o: 'O', u: 'U', e: 'E' };

  function englishWordToTokens(word) {
    var w = word.toLowerCase().replace(/[^a-z']/g, '');
    if (!w) return [];

    // 접미사 관용 표기: tion → 션, ssion → 션, sion → 전, ture → 처, sure → 저
    w = w.replace(/ssion/g, '0').replace(/tion/g, '0').replace(/sion/g, '1')
         .replace(/ture(s?)$/, '2$1').replace(/sure(s?)$/, '3$1');
    // 자음 + le 어미 → 플/틀/클 ... (apple → 애플)  ※ 마커 6
    w = w.replace(/([bcdfghkpstvz])le$/, '$16');
    // are/ire/ore/ere → 에어/아이어/오어/이어 (magic e보다 먼저 처리해야 함)
    w = w.replace(/are$/, '4').replace(/ire$/, 'I5').replace(/ore$/, 'o5').replace(/ere$/, 'i5');
    // magic e: made → mAd(에이), time → tIm(아이) ...
    w = w.replace(/([aioue])([bcdfgklmnprstvz])e$/, function (m, v, c) { return MAGIC_E[v] + c; });

    var toks = [];
    var i = 0;
    var isVowelCh = function (c) { return c && 'aeiouyAIOUE'.indexOf(c) >= 0; };

    while (i < w.length) {
      var rest = w.slice(i);
      var ch = w[i];

      // 특수 마커
      if (ch === '0') { toks.push(EN_CONS.sh, V('ㅓ'), EN_CONS.n); i++; continue; }
      if (ch === '1') { toks.push(EN_CONS.j, V('ㅓ'), EN_CONS.n); i++; continue; }
      if (ch === '2') { toks.push(EN_CONS.ch, V('ㅓ')); i++; continue; }
      if (ch === '3') { toks.push(EN_CONS.j, V('ㅓ')); i++; continue; }
      if (ch === '4') { toks.push(V('ㅔ'), V('ㅓ')); i++; continue; }
      if (ch === '5') { toks.push(V('ㅓ')); i++; continue; }
      if (ch === '6') { toks.push(V('ㅡ'), EN_CONS.l); i++; continue; }

      // magic e 마커
      if (ch === 'A') { toks.push(V('ㅔ'), V('ㅣ', true)); i++; continue; }
      if (ch === 'I') { toks.push(V('ㅏ'), V('ㅣ', true)); i++; continue; }
      if (ch === 'O') { toks.push(V('ㅗ'), V('ㅜ', true)); i++; continue; }
      if (ch === 'U') { toks.push(G('y'), V('ㅜ', true)); i++; continue; }
      if (ch === 'E') { toks.push(V('ㅣ', true)); i++; continue; }

      // 겹자음은 한 번만 (ll, ss, tt ...)
      if (ch === w[i - 1] && !isVowelCh(ch)) { i++; continue; }

      // 여러 글자 패턴
      if (rest.indexOf('tch') === 0) { toks.push(EN_CONS.ch); i += 3; continue; }
      if (rest.indexOf('eigh') === 0) { toks.push(V('ㅔ'), V('ㅣ', true)); i += 4; continue; }
      if (rest.indexOf('igh') === 0) { toks.push(V('ㅏ'), V('ㅣ', true)); i += 3; continue; }
      if (rest.indexOf('chr') === 0) { toks.push(EN_CONS.k); i += 2; continue; }
      if (rest.indexOf('ch') === 0) { toks.push(EN_CONS.ch); i += 2; continue; }
      if (rest.indexOf('sh') === 0) { toks.push(EN_CONS.sh); i += 2; continue; }
      if (rest.indexOf('ph') === 0) { toks.push(EN_CONS.f); i += 2; continue; }
      if (rest.indexOf('th') === 0) { toks.push(EN_CONS.th); i += 2; continue; }
      if (rest.indexOf('wh') === 0) { toks.push(G('w')); i += 2; continue; }
      if (rest.indexOf('ck') === 0) { toks.push(EN_CONS.k); i += 2; continue; }
      if (rest.indexOf('gh') === 0) { if (i === 0) toks.push(EN_CONS.g); i += 2; continue; } // light, night
      if (i === 0 && rest.indexOf('kn') === 0) { toks.push(EN_CONS.n); i += 2; continue; }
      if (i === 0 && rest.indexOf('wr') === 0) { toks.push(EN_CONS.r); i += 2; continue; }
      if (rest.indexOf('qu') === 0) { toks.push(EN_CONS.k, G('w')); i += 2; continue; }
      if (ch === 'x') { toks.push(EN_CONS.k, EN_CONS.s); i++; continue; }
      if (rest.indexOf('ng') === 0) { toks.push(NG()); i += 2; continue; }
      if (ch === 'n' && (w[i + 1] === 'k' || w[i + 1] === 'q')) { toks.push(NG()); i++; continue; } // think → 씽크

      // r가 붙은 모음 (r 뒤에 모음이 없을 때)
      if (!isVowelCh(w[i + 2])) {
        if (rest.indexOf('ear') === 0) { toks.push(V('ㅣ'), V('ㅓ', true)); i += 3; continue; }
        if (rest.indexOf('air') === 0) { toks.push(V('ㅔ'), V('ㅓ', true)); i += 3; continue; }
        if (rest.indexOf('eer') === 0) { toks.push(V('ㅣ'), V('ㅓ', true)); i += 3; continue; }
        if (rest.indexOf('our') === 0) { toks.push(V('ㅏ'), V('ㅜ'), V('ㅓ', true)); i += 3; continue; }
      }
      if (!isVowelCh(w[i + 1]) && w[i + 1] !== '5') {
        if (rest.indexOf('ar') === 0) { toks.push(V('ㅏ', true)); i += 2; continue; }
        if (rest.indexOf('or') === 0) { toks.push(V('ㅗ', true)); i += 2; continue; }
        if (rest.indexOf('er') === 0 || rest.indexOf('ir') === 0 || rest.indexOf('ur') === 0) {
          toks.push(V('ㅓ', true)); i += 2; continue;
        }
      }

      // 모음 두 글자
      if (rest.indexOf('ee') === 0) { toks.push(V('ㅣ', true)); i += 2; continue; }
      if (rest.indexOf('ea') === 0) { toks.push(V('ㅣ', true)); i += 2; continue; }
      if (rest.indexOf('oo') === 0) { toks.push(V('ㅜ', w[i + 2] !== 'k')); i += 2; continue; } // book → 북
      if (rest.indexOf('ou') === 0) { toks.push(V('ㅏ'), V('ㅜ', true)); i += 2; continue; }
      if (rest.indexOf('ow') === 0) {
        if (i + 2 >= w.length) toks.push(V('ㅗ'), V('ㅜ', true)); // low → 로우
        else toks.push(V('ㅏ'), V('ㅜ', true));                    // town → 타운
        i += 2; continue;
      }
      if (rest.indexOf('ai') === 0 || rest.indexOf('ay') === 0) { toks.push(V('ㅔ'), V('ㅣ', true)); i += 2; continue; }
      if (rest.indexOf('oa') === 0) { toks.push(V('ㅗ'), V('ㅜ', true)); i += 2; continue; }
      if (rest.indexOf('oi') === 0 || rest.indexOf('oy') === 0) { toks.push(V('ㅗ'), V('ㅣ', true)); i += 2; continue; }
      if (rest.indexOf('au') === 0 || rest.indexOf('aw') === 0) { toks.push(V('ㅗ', true)); i += 2; continue; }
      if (rest.indexOf('ew') === 0) { toks.push(G('y'), V('ㅜ', true)); i += 2; continue; }
      if (rest.indexOf('ie') === 0) {
        if (i + 2 >= w.length) toks.push(V('ㅏ'), V('ㅣ', true)); // tie → 타이
        else toks.push(V('ㅣ', true));
        i += 2; continue;
      }
      if (rest.indexOf('ue') === 0 || rest.indexOf('ui') === 0) { toks.push(V('ㅜ', true)); i += 2; continue; }

      // 단모음
      if (ch === 'a' || ch === 'e' || ch === 'i' || ch === 'o' || ch === 'u') {
        if (ch === 'e' && i === w.length - 1 && toks.some(function (t) { return t.t === 'V'; })) { i++; continue; } // 어말 묵음 e
        if (ch === 'a' && '01'.indexOf(w[i + 1]) >= 0) { toks.push(V('ㅔ'), V('ㅣ', true)); i++; continue; } // nation → 네이션
        if (ch === 'u') {
          // 열린 음절의 u는 '유' (music → 뮤직), 어말 u는 '우'
          if (i === w.length - 1) { toks.push(V('ㅜ')); i++; continue; }
          if ('0123'.indexOf(w[i + 1]) >= 0) { toks.push(G('y'), V('ㅜ')); i++; continue; } // future → 퓨처
          if (!isVowelCh(w[i + 1]) && isVowelCh(w[i + 2]) && w[i + 1] !== 'r') { toks.push(G('y'), V('ㅜ')); i++; continue; }
        }
        toks.push(V(EN_VOWELS[ch]));
        i++; continue;
      }
      if (ch === 'y') {
        if (isVowelCh(w[i + 1]) || '0123'.indexOf(w[i + 1]) >= 0) toks.push(G('y'));
        else toks.push(V('ㅣ'));
        i++; continue;
      }
      if (ch === 'w') { toks.push(G('w')); i++; continue; }

      // 나머지 자음
      if (ch === 'c') { toks.push('eiy'.indexOf(w[i + 1]) >= 0 ? EN_CONS.s : EN_CONS.k); i++; continue; }
      if (ch === 'g') { toks.push('eiy'.indexOf(w[i + 1]) >= 0 ? EN_CONS.j : EN_CONS.g); i++; continue; }
      if (EN_CONS[ch]) { toks.push(EN_CONS[ch]); i++; continue; }
      i++; // 그 밖의 문자는 무시
    }
    return toks;
  }

  /* ------------------------------------------------------------------ */
  /* 공개 API : 외국어 → 한글 발음                                          */
  /* ------------------------------------------------------------------ */

  function transliterateWord(word, lang) {
    if (lang === 'en') {
      var lower = word.toLowerCase().replace(/[^a-z']/g, '');
      if (EN_WORDS[lower]) return EN_WORDS[lower];
      return tokensToHangul(englishWordToTokens(word), { freeStopCoda: false });
    }
    // 따갈로그어 / 비사야어
    return tokensToHangul(filipinoWordToTokens(word), { freeStopCoda: true });
  }

  function transliterateToHangul(text, lang) {
    // 알파벳 덩어리(단어)만 변환하고 공백·문장부호는 그대로 유지
    return text.replace(/[A-Za-z][A-Za-z']*/g, function (word) {
      return transliterateWord(word, lang) || word;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 공개 API : 한국어 → 로마자 (국어의 로마자 표기법 기반, 음절 단위)          */
  /* ------------------------------------------------------------------ */

  var CHO_RR = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
  var JUNG_RR = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
  var JONG_RR = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

  function romanizeKorean(text) {
    var out = '';
    for (var idx = 0; idx < text.length; idx++) {
      var code = text.charCodeAt(idx);
      if (code >= 0xac00 && code <= 0xd7a3) {
        var s = code - 0xac00;
        out += CHO_RR[Math.floor(s / 588)] + JUNG_RR[Math.floor((s % 588) / 28)] + JONG_RR[s % 28];
      } else {
        out += text[idx];
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ */

  var api = {
    transliterateToHangul: transliterateToHangul,
    romanizeKorean: romanizeKorean,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Translit = api;
})(typeof window !== 'undefined' ? window : this);
