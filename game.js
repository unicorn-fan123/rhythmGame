/* ===== YouTube IFrame API ===== */
    let player = null;

    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => buildPlayer();

    function buildPlayer(){
      // ✅ 영상 ID 고정
      const vid = "luDW7RZr4Xs";

      if (location.protocol === "file:") {
        alert("file://로 열면 영상이 막힐 수 있어. http://localhost 나 GitHub Pages 같은 http(s)로 실행해줘.");
      }
      if(player && player.destroy) player.destroy();

      player = new YT.Player('player', {
        videoId: vid,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
        events: {
          onReady: () => {
            const d = player.getDuration?.();
            if(d && !isNaN(d) && d > 10) songLength = d;
            syncOverlaySize();
            setTimeout(syncOverlaySize, 200);
            setTimeout(syncOverlaySize, 600);
          },
          onStateChange: (e) => { if(e && e.data === 0) finishGame("ENDED"); },
          onError: (e) => { if(e && e.data === 153){ alert("YouTube 오류 153: localhost/배포 도메인에서 열고 origin/referrer 정책을 확인해줘."); } }
        }
      });
    }

    const ui = {
      lanes: document.getElementById('lanes'),
      overlay: document.getElementById('overlay'),
      playSurface: document.getElementById('playSurface'),
      judgeOverlay: document.getElementById('judgeOverlay'),
      timeTxt: document.getElementById('timeTxt'),
      scoreTxt: document.getElementById('scoreTxt'),
      comboTxt: document.getElementById('comboTxt'),
      accTxt: document.getElementById('accTxt'),
      hitTxt: document.getElementById('hitTxt'),
      missTxt: document.getElementById('missTxt'),
      fxCanvas: document.getElementById('fxCanvas'),
      resultScreen: document.getElementById('resultScreen'),
      resScore: document.getElementById('resScore'),
      resHit: document.getElementById('resHit'),
      resMiss: document.getElementById('resMiss'),
      resAcc: document.getElementById('resAcc'),
      resMaxCombo: document.getElementById('resMaxCombo'),
      resRestartBtn: document.getElementById('resRestartBtn'),
      resCloseBtn: document.getElementById('resCloseBtn'),
    };

    function syncOverlaySize(){
      const playerDiv = document.getElementById('player');
      const iframe = playerDiv.querySelector('iframe');
      let h = iframe ? iframe.clientHeight : 0;
      if(!h || h < 50) h = playerDiv.clientHeight;
      if(!h || h < 50){ setTimeout(syncOverlaySize, 60); return; }

      const EXTRA_TOP = 22, EXTRA_BOTTOM = 28;
      ui.overlay.style.height = (h + EXTRA_TOP + EXTRA_BOTTOM) + "px";
      ui.playSurface.style.height = (h + EXTRA_TOP + EXTRA_BOTTOM) + "px";

      const rect = ui.playSurface.getBoundingClientRect();
      ui.fxCanvas.width = Math.max(1, Math.floor(rect.width));
      ui.fxCanvas.height = Math.max(1, Math.floor(rect.height));
    }
    window.addEventListener('resize', () => { syncOverlaySize(); resizeEditorCanvas(); });

    /* ===== Game 기본 상태 ===== */
    let laneCount = 6;
    let keymap = ["KeyS","KeyD","KeyF","KeyJ","KeyK","KeyL","KeyA","Semicolon"].slice(0,laneCount);

    // 채보 포맷: { lane, kind:"tap"|"hold", start, end? }
    let chart = [];
    const CHART_STORAGE_KEY = "rhythm.chart.v1";

    function sanitizeChart(raw){
      if(!Array.isArray(raw)) return null;
      const out = [];
      for(const n of raw){
        if(!n || typeof n !== "object") continue;
        const lane = Number(n.lane);
        const kind = n.kind === "hold" ? "hold" : (n.kind === "tap" ? "tap" : null);
        const start = Number(n.start);
        if(!Number.isFinite(lane) || lane < 0 || lane >= laneCount) continue;
        if(!Number.isFinite(start) || start < 0) continue;
        if(kind === "tap"){
          out.push({ lane, kind, start: round4(start) });
        }else if(kind === "hold"){
          const end = Number(n.end);
          if(!Number.isFinite(end) || end <= start) continue;
          out.push({ lane, kind, start: round4(start), end: round4(end) });
        }
      }
      return out.sort((a,b)=> a.start === b.start ? a.lane - b.lane : a.start - b.start);
    }

    function loadStoredChart(){
      try{
        const raw = localStorage.getItem(CHART_STORAGE_KEY);
        if(!raw) return null;
        return sanitizeChart(JSON.parse(raw));
      }catch(e){
        return null;
      }
    }

    function saveChart(){
      try{
        localStorage.setItem(CHART_STORAGE_KEY, JSON.stringify(chart));
      }catch(e){}
    }

    let noteEls = [];
    let hitFlags = [];
    let startedFlags = [];
    let activeHolds = Array(8).fill(null);
    let keyHeld = Array(8).fill(false);

    let playing = false;
    let finished = false;
    let editMode = false;

    let score = 0, combo = 0, hit = 0, miss = 0;
    let maxCombo = 0;
    let totalJudgePoints = 0, totalPossible = 0;

    const DEMO_END = 177.0; // 2:57
    let songLength = DEMO_END; // 실제 길이는 onReady에서 갱신

    function getSpeed(){ return Number(document.getElementById('speed')?.value || 620); }
    function windowsMs(){
      return {
        p: Number(document.getElementById('wPerfect')?.value ||  85),
        g: Number(document.getElementById('wGreat')?.value   || 150),
        d: Number(document.getElementById('wGood')?.value    || 220),
        m: Number(document.getElementById('wMiss')?.value    || 320),
      };
    }
    function nowTime(){ return (player?.getCurrentTime) ? player.getCurrentTime() : null; }
    function round4(x){ return Number(x.toFixed(4)); }

    function laneColorHex(lane){
      const hue = (lane * (360 / Math.max(1, laneCount)) + 280) % 360;
      return hslToHex(hue, 95, 62);
    }
    function hslToHex(h, s, l){
      s /= 100; l /= 100;
      const k = n => (n + h/30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = n => l - a * Math.max(-1, Math.min(k(n)-3, Math.min(9-k(n), 1)));
      const toHex = x => Math.round(x*255).toString(16).padStart(2,'0');
      return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
    }
    function neonFlash(el){
      if(!el) return;
      el.classList.remove('neonHit');
      void el.offsetWidth;
      el.classList.add('neonHit');
    }

    /* ===== 쉬운/직관 채보 생성 (영상 전체 길이 기준) ===== */
    function makeEasyChart(){
      const start = 1.0, end = songLength || DEMO_END;
      const bpm = 120;
      const beat = 60 / bpm;
      const bar = beat * 4;
      const out = [];
      const lane = (x)=>((x%laneCount)+laneCount)%laneCount;
      const pushTap  = (tt, ln)=> out.push({ lane: lane(ln), kind:"tap",  start: round4(tt) });
      const pushHold = (st, ln, ed)=> out.push({ lane: lane(ln), kind:"hold", start: round4(st), end: round4(ed) });

      const stairsL = [0,1,2,3,4,5];
      const stairsR = [5,4,3,2,1,0];
      const mirrorA = [0,2,1,3,4,5];
      const mirrorB = [5,3,4,2,1,0];

      let t = start;
      let barIdx = 0;

      while(t < end){
        const sec = t;
        const pat =
          (barIdx % 8 < 2) ? stairsL :
          (barIdx % 8 < 4) ? stairsR :
          (barIdx % 8 < 6) ? mirrorA : mirrorB;

        if(barIdx % 6 === 2 && sec > 6){
          const ln = pat[barIdx % pat.length];
          const dur = beat * (Math.random() < 0.5 ? 2 : 3);
          pushHold(t, ln, t + dur);
        }

        for(let k=0;k<4;k++){
          const bt = t + k*beat;
          const ln = pat[(barIdx + k) % pat.length];
          pushTap(bt, ln);

          if(sec > 15 && Math.random() < 0.18){
            const ln2 = pat[(barIdx + k + 2) % pat.length];
            pushTap(bt + beat/2, ln2);
          }

          if(sec > 30 && Math.random() < 0.03){
            const chord = (Math.random() < 0.5) ? [0,5] : [2,3];
            pushTap(bt, chord[0]);
            pushTap(bt, chord[1]);
          }
        }

        t += bar;
        barIdx++;
      }

      return out
        .filter(n => n.start >= start && n.start <= end)
        .sort((a,b)=> a.start === b.start ? a.lane - b.lane : a.start - b.start);
    }

    function rebuildLanes(){
      ui.lanes.innerHTML = "";
      for(let i=0;i<laneCount;i++){
        const lane = document.createElement('div');
        lane.className = 'lane';
        lane.dataset.lane = String(i);
        lane.style.setProperty('--laneGlow', laneColorHex(i));

        const press = document.createElement('div');
        press.className = 'lanePress';
        lane.appendChild(press);

        const cap = document.createElement('div');
        cap.className = 'keycap';
        cap.textContent = (keymap[i] || "").replace("Key","").replace("Digit","");
        lane.appendChild(cap);

        ui.lanes.appendChild(lane);
      }
    }

    const SPAWN_TOP = "-260px";

    function loadChart(newChart){
      chart = (newChart || []).slice().sort((a,b)=> a.start === b.start ? a.lane - b.lane : a.start - b.start);
      hitFlags = chart.map(()=>false);
      startedFlags = chart.map(()=>false);

      noteEls.forEach(o => { o?.head?.remove?.(); o?.body?.remove?.(); o?.tail?.remove?.(); });

      noteEls = chart.map(n => {
        const laneEl = ui.lanes.querySelector(`.lane[data-lane="${n.lane}"]`);
        const head = document.createElement('div');
        head.className = 'note' + (n.kind==="hold" ? ' holdHead' : '');
        head.style.top = SPAWN_TOP;

        const col = laneColorHex(n.lane);
        head.style.setProperty('--noteCol', col);
        laneEl.appendChild(head);

        if(n.kind === "hold"){
          const body = document.createElement('div');
          body.className = 'holdBody';
          body.style.top = SPAWN_TOP;
          body.style.height = "10px";
          body.style.setProperty('--noteCol', col);
          laneEl.appendChild(body);

          const tail = document.createElement('div');
          tail.className = 'note holdTail';
          tail.style.top = SPAWN_TOP;
          tail.style.setProperty('--noteCol', col);
          laneEl.appendChild(tail);

          return { head, body, tail };
        }
        return { head };
      });

      totalPossible = chart.length;
      saveChart();
    }

    /* ===== FX ===== */
    const fx = { ctx: ui.fxCanvas.getContext('2d'), particles: [], rings: [] };

    function hitYpx(){
      const h = ui.playSurface.getBoundingClientRect().height;
      const pct = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hitY')) / 100;
      return h * pct;
    }

    function spawnHitFX(lane, grade){
      const laneEl = ui.lanes.querySelector(`.lane[data-lane="${lane}"]`);
      if(!laneEl) return;

      const pr = ui.playSurface.getBoundingClientRect();
      const lr = laneEl.getBoundingClientRect();
      const x = (lr.left - pr.left) + lr.width/2;
      const y = hitYpx();

      fx.rings.push({ x, y, r: 8, life: 0, max: 14 });

      const n = grade === "PERFECT" ? 28 : grade === "GREAT" ? 20 : grade === "GOOD" ? 14 : 8;
      for(let i=0;i<n;i++){
        const ang = Math.random() * Math.PI * 2;
        const sp = grade === "PERFECT" ? (3.7 + Math.random()*2.8) : grade === "GREAT" ? (3.0 + Math.random()*2.4) : (2.3 + Math.random()*1.8);
        fx.particles.push({ x, y, vx: Math.cos(ang)*sp, vy: Math.sin(ang)*sp - 0.6, life: 0, max: grade === "PERFECT" ? 18 : 14, kind: grade });
      }
    }

    function drawFX(){
      const ctx = fx.ctx;
      const w = ui.fxCanvas.width, h = ui.fxCanvas.height;
      if(w<=1||h<=1) return;

      ctx.clearRect(0,0,w,h);

      for(let i=fx.rings.length-1;i>=0;i--){
        const r = fx.rings[i];
        r.life++;
        const t = r.life / r.max;
        const rr = r.r + t*34;

        ctx.save();
        ctx.globalAlpha = (1-t) * 0.95;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(210,170,255,0.95)";
        ctx.shadowBlur = 18;
        ctx.shadowColor = "rgba(210,170,255,0.95)";
        ctx.beginPath();
        ctx.arc(r.x, r.y, rr, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();

        if(r.life >= r.max) fx.rings.splice(i,1);
      }

      for(let i=fx.particles.length-1;i>=0;i--){
        const p = fx.particles[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;

        const tt = p.life / p.max;
        const a = (1-tt);

        ctx.save();
        ctx.globalAlpha = a;

        let col = "rgba(255,255,255,0.98)";
        let glow = "rgba(255,255,255,0.75)";
        if(p.kind==="PERFECT"){ col="rgba(210,170,255,0.98)"; glow="rgba(210,170,255,0.95)"; }
        else if(p.kind==="GREAT"){ col="rgba(130,210,255,0.98)"; glow="rgba(130,210,255,0.9)"; }
        else if(p.kind==="GOOD"){ col="rgba(90,255,190,0.98)"; glow="rgba(90,255,190,0.85)"; }

        ctx.fillStyle = col;
        ctx.shadowBlur = 16;
        ctx.shadowColor = glow;

        const size = p.kind==="PERFECT" ? 3.3 : 2.9;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        if(p.life >= p.max) fx.particles.splice(i,1);
      }
    }

    /* ===== UI helpers ===== */
    function lanePressFx(lane, pressed){
      const laneEl = ui.lanes.querySelector(`.lane[data-lane="${lane}"]`);
      if(!laneEl) return;
      laneEl.classList.toggle('pressed', !!pressed);
    }
    function setHoldingLane(lane, on){
      const laneEl = ui.lanes.querySelector(`.lane[data-lane="${lane}"]`);
      if(!laneEl) return;
      laneEl.classList.toggle('holding', !!on);
    }
    function showJudge(text, cls){
      ui.judgeOverlay.textContent = text;
      ui.judgeOverlay.className = "judgeOverlay " + cls;
      ui.judgeOverlay.classList.remove('show');
      void ui.judgeOverlay.offsetWidth;
      ui.judgeOverlay.classList.add('show');
    }
    function doShake(){} // 흔들림 OFF

    /* ===== Result ===== */
    function showResult(){
      const acc = totalPossible > 0 ? (totalJudgePoints / totalPossible) * 100 : 0;
      ui.resScore.textContent = String(score);
      ui.resHit.textContent = String(hit);
      ui.resMiss.textContent = String(miss);
      ui.resAcc.textContent = acc.toFixed(2) + "%";
      ui.resMaxCombo.textContent = String(maxCombo);
      ui.resultScreen.style.display = "flex";
    }
    function hideResult(){ ui.resultScreen.style.display = "none"; }

    function finishGame(reason){
      if(finished) return;
      finished = true;
      playing = false;
      player?.pauseVideo?.();
      showJudge(reason === "ENDED" ? "FINISH" : "DONE", "j-great");
      showResult();
    }

    function judgeFromDt(bestDtMs, w){
      if(bestDtMs <= w.p) return {add:1100, jp:1.0, j:"PERFECT", cls:"j-perfect"};
      if(bestDtMs <= w.g) return {add:780,  jp:0.8, j:"GREAT",   cls:"j-great"};
      if(bestDtMs <= w.d) return {add:460,  jp:0.5, j:"GOOD",    cls:"j-good"};
      return {add:0, jp:0, j:"MISS", cls:"j-miss"};
    }

    function onHit(lane){
      const t = nowTime();
      if(t == null || finished || editMode) return;

      let bestIdx = -1, bestDt = Infinity;

      for(let i=0;i<chart.length;i++){
        if(hitFlags[i]) continue;
        if(chart[i].lane !== lane) continue;
        if(chart[i].kind==="hold" && startedFlags[i]) continue;

        const dt = (chart[i].start - t) * 1000;
        const adt = Math.abs(dt);
        if(chart[i].start - t > 2.0) break;
        if(adt < bestDt){ bestDt = adt; bestIdx = i; }
      }

      const w = windowsMs();
      if(bestIdx === -1 || bestDt > w.m){
        showJudge("MISS", "j-miss");
        combo = 0; miss++;
        updateHud();
        return;
      }

      const res = judgeFromDt(bestDt, w);
      if(res.j === "MISS"){
        miss++; combo = 0;
        showJudge("MISS", "j-miss");
        updateHud();
        return;
      }

      hit++; combo++; maxCombo = Math.max(maxCombo, combo);
      score += res.add + Math.min(520, combo * 2);
      totalJudgePoints += res.jp;

      showJudge(res.j, res.cls);
      neonFlash(noteEls[bestIdx]?.head);
      spawnHitFX(lane, res.j);

      const n = chart[bestIdx];
      if(n.kind !== "hold"){
        hitFlags[bestIdx] = true;
        noteEls[bestIdx]?.head && (noteEls[bestIdx].head.style.display="none");
        updateHud();
        return;
      }

      startedFlags[bestIdx] = true;
      const endT = n.end ?? (n.start + 1.6);
      activeHolds[lane] = { idx: bestIdx, end: endT };
      setHoldingLane(lane, true);
      updateHud();
    }

    function failHoldEarly(lane){
      const h = activeHolds[lane];
      if(!h) return;
      const obj = noteEls[h.idx];
      obj?.head && (obj.head.style.display="none");
      obj?.body && (obj.body.style.display="none");
      obj?.tail && (obj.tail.style.display="none");
      hitFlags[h.idx] = true;

      activeHolds[lane] = null;
      setHoldingLane(lane, false);

      miss++; combo = 0;
      showJudge("HOLD MISS", "j-miss");
      updateHud();
    }

    function completeHold(lane){
      const h = activeHolds[lane];
      if(!h) return;

      const obj = noteEls[h.idx];
      neonFlash(obj?.head);
      neonFlash(obj?.tail);

      obj?.head && (obj.head.style.display="none");
      obj?.body && (obj.body.style.display="none");
      obj?.tail && (obj.tail.style.display="none");
      hitFlags[h.idx] = true;

      activeHolds[lane] = null;
      setHoldingLane(lane, false);

      score += 480;
      totalJudgePoints += 0.6;

      showJudge("HOLD OK", "j-great");
      spawnHitFX(lane, "GREAT");
      updateHud();
    }

    function updateNotes(){
      const t = nowTime();
      if(t == null) return;

      ui.timeTxt.textContent = t.toFixed(3);

      if(t >= songLength - 0.02 && playing){
        finishGame("DONE");
        return;
      }

      const speed = getSpeed();
      const hy = hitYpx();
      const ms = windowsMs().m;

      for(let lane=0; lane<laneCount; lane++){
        const h = activeHolds[lane];
        if(!h) continue;
        if(t >= h.end) completeHold(lane);
      }

      for(let i=0;i<chart.length;i++){
        const obj = noteEls[i];
        if(!obj || hitFlags[i]) continue;

        const n = chart[i];

        if(n.kind !== "hold"){
          const dt = n.start - t;
          const y = hy - (dt * speed);
          const lateMs = (-dt) * 1000;

          if(lateMs > ms){
            hitFlags[i] = true;
            obj.head && (obj.head.style.display = "none");
            miss++; combo = 0;
            updateHud();
            continue;
          }

          obj.head.style.top = (y - 8) + "px";
          continue;
        }

        const endT = n.end ?? (n.start + 1.6);

        if(!startedFlags[i]){
          const dt = n.start - t;
          const lateMs = (-dt) * 1000;
          if(lateMs > ms){
            hitFlags[i] = true;
            obj.head.style.display="none";
            obj.body.style.display="none";
            obj.tail.style.display="none";
            miss++; combo = 0;
            updateHud();
            continue;
          }
        }

        const dtHead = n.start - t;
        const dtTail = endT - t;

        let yHead = hy - (dtHead * speed);
        const yTail = hy - (dtTail * speed);

        if(startedFlags[i]) yHead = hy;

        obj.head.style.top = (yHead - 8) + "px";
        obj.tail.style.top = (yTail - 8) + "px";

        const top = Math.min(yHead, yTail) - 3;
        const bottom = Math.max(yHead, yTail) + 3;
        obj.body.style.top = top + "px";
        obj.body.style.height = Math.max(10, bottom - top) + "px";
      }
    }

    function updateHud(){
      ui.scoreTxt.textContent = String(score);
      ui.comboTxt.textContent = String(combo);
      ui.hitTxt.textContent = String(hit);
      ui.missTxt.textContent = String(miss);
      const acc = totalPossible > 0 ? (totalJudgePoints / totalPossible) * 100 : 0;
      ui.accTxt.textContent = acc.toFixed(2) + "%";
    }

    /* ===== Restart용 강제 리셋 (채보 유지) ===== */
    function hardResetForRestart(seek=0){
      playing = false;
      finished = false;
      hideResult();

      activeHolds = Array(8).fill(null);
      keyHeld = Array(8).fill(false);
      document.querySelectorAll('.lane.holding').forEach(x=>x.classList.remove('holding'));
      document.querySelectorAll('.lane.pressed').forEach(x=>x.classList.remove('pressed'));

      hitFlags = chart.map(()=>false);
      startedFlags = chart.map(()=>false);

      for(let i=0;i<noteEls.length;i++){
        const o = noteEls[i];
        if(!o) continue;
        if(o.head){ o.head.style.display="block"; o.head.style.top=SPAWN_TOP; }
        if(o.body){ o.body.style.display="block"; o.body.style.top=SPAWN_TOP; o.body.style.height="10px"; }
        if(o.tail){ o.tail.style.display="block"; o.tail.style.top=SPAWN_TOP; }
      }

      score = 0; combo = 0; hit = 0; miss = 0;
      maxCombo = 0; totalJudgePoints = 0;
      updateHud();

      fx.particles.length = 0;
      fx.rings.length = 0;
      ui.judgeOverlay.classList.remove("show");

      player?.pauseVideo?.();
      player?.seekTo?.(seek, true);

      syncOverlaySize();
    }

    /* ===== 에디터 (타임라인) ===== */
    const editorCanvas = document.getElementById('editorCanvas');
    const editorCtx = editorCanvas.getContext('2d');
    const viewDurRange = document.getElementById('viewDurRange');
    const viewStartRange = document.getElementById('viewStartRange');
    const modePlayBtn = document.getElementById('modePlayBtn');
    const modeEditBtn = document.getElementById('modeEditBtn');
    const generateEasyBtn = document.getElementById('generateEasyBtn');
    const clearChartBtn = document.getElementById('clearChartBtn');

    let viewDur = 20;
    let viewStart = 0;
    let editorCurrentTime = 0;
    let editorMouseDown = null; // {t0,lane0,x0,y0,noteIdx}

    function resizeEditorCanvas(){
      const rect = editorCanvas.getBoundingClientRect();
      editorCanvas.width = Math.max(1, Math.floor(rect.width));
      editorCanvas.height = Math.max(1, Math.floor(rect.height));
    }
    resizeEditorCanvas();

    function updateViewDurFromSlider(){
      viewDur = parseFloat(viewDurRange.value) || 20;
      if(viewDur < 5) viewDur = 5;
      if(viewDur > songLength) viewDur = Math.max(5, songLength);
    }
    function updateViewStartFromSlider(){
      const maxStart = Math.max(0, songLength - viewDur);
      const frac = parseFloat(viewStartRange.value) / 1000;
      viewStart = maxStart * frac;
    }

    viewDurRange.addEventListener('input', () => updateViewDurFromSlider());
    viewStartRange.addEventListener('input', () => updateViewStartFromSlider());
    updateViewDurFromSlider();
    updateViewStartFromSlider();

    function timeToX(t){
      const w = editorCanvas.width;
      return (t - viewStart) * (w / viewDur);
    }
    function xToTime(x){
      const w = editorCanvas.width;
      return viewStart + (x / w) * viewDur;
    }
    function formatTimeLabel(t){
      const m = Math.floor(t / 60);
      const s = t - m * 60;
      if(m > 0){
        const sStr = s.toFixed(1).padStart(4, "0");
        return m + ":" + sStr;
      }
      return s.toFixed(1);
    }
    function keyLabel(code){
      if(!code) return "";
      if(code.startsWith("Key")) return code.slice(3);
      if(code === "Semicolon") return ";";
      return code;
    }

    function drawEditor(){
      const ctx = editorCtx;
      const w = editorCanvas.width;
      const h = editorCanvas.height;
      if(w<=1 || h<=1){ return; }

      ctx.clearRect(0,0,w,h);

      // 배경
      ctx.fillStyle = "rgba(15,23,42,0.95)";
      ctx.fillRect(0,0,w,h);

      // 레인 가로줄
      const rowH = h / laneCount;
      // 레인 라벨 (키)
      ctx.fillStyle = "rgba(229,231,235,0.85)";
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Apple SD Gothic Neo, \"Noto Sans KR\", sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for(let l=0;l<laneCount;l++){
        const yMid = l * rowH + rowH * 0.5;
        const label = keyLabel(keymap[l]);
        ctx.fillText(label, 8, yMid);
      }
      for(let l=0;l<laneCount;l++){
        const y = l * rowH;
        ctx.strokeStyle = "rgba(148,163,184,0.35)";
        ctx.lineWidth = (l===0 || l===laneCount-1) ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // 시간 그리드 (bpm 기준)
      const bpm = 120;
      const beat = 60 / bpm;
      const sx = w / viewDur;

      const startBeat = Math.floor(viewStart / beat);
      const endBeat = Math.ceil((viewStart + viewDur) / beat);

      for(let b = startBeat; b <= endBeat; b++){
        const t = b * beat;
        const x = (t - viewStart) * sx;
        if(x < 0 || x > w) continue;
        const isBar = (b % 4 === 0);
        ctx.strokeStyle = isBar ? "rgba(148,163,184,0.65)" : "rgba(148,163,184,0.25)";
        ctx.lineWidth = isBar ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }


      // 시간 라벨
      const labelTargets = 8;
      const rawStep = viewDur / labelTargets;
      const steps = [0.5, 1, 2, 5, 10, 20, 30, 60];
      let step = steps[steps.length - 1];
      for(let i=0;i<steps.length;i++){
        if(rawStep <= steps[i]){ step = steps[i]; break; }
      }
      const firstTick = Math.ceil(viewStart / step) * step;

      ctx.fillStyle = "rgba(229,231,235,0.85)";
      ctx.strokeStyle = "rgba(229,231,235,0.25)";
      ctx.lineWidth = 1;
      ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Apple SD Gothic Neo, \"Noto Sans KR\", sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      for(let t = firstTick; t <= viewStart + viewDur + 0.0001; t += step){
        const x = (t - viewStart) * sx;
        if(x < 0 || x > w) continue;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 6);
        ctx.stroke();
        ctx.fillText(formatTimeLabel(t), x, 8);
      }

      // 노트 렌더링
      for(let i=0;i<chart.length;i++){
        const n = chart[i];
        const lane = n.lane;
        const yTop = lane * rowH + rowH*0.18;
        const yH = rowH*0.64;

        if(n.kind === "tap"){
          const t = n.start;
          if(t < viewStart || t > viewStart + viewDur) continue;
          const x = (t - viewStart) * sx;

          const col = laneColorHex(lane);
          ctx.fillStyle = col;
          ctx.strokeStyle = "rgba(15,23,42,0.9)";
          ctx.lineWidth = 1.2;
          const wNote = 8;
          ctx.beginPath();
          ctx.roundRect(x - wNote/2, yTop + yH*0.25, wNote, yH*0.5, 4);
          ctx.fill();
          ctx.stroke();
        }else{
          const st = n.start;
          const ed = n.end ?? (n.start+1.6);
          if(ed < viewStart || st > viewStart + viewDur) continue;

          const x1 = Math.max(viewStart, st);
          const x2 = Math.min(viewStart + viewDur, ed);
          const col = laneColorHex(lane);

          // 바디
          ctx.fillStyle = col + "55";
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect((x1 - viewStart)*sx, yTop + yH*0.2, (x2 - x1)*sx, yH*0.6, 5);
          ctx.fill();
          ctx.stroke();

          // 헤드/테일 강조
          ctx.fillStyle = col;
          const headX = (st - viewStart)*sx;
          const tailX = (ed - viewStart)*sx;
          const wHead = 10;
          ctx.beginPath();
          ctx.roundRect(headX - wHead/2, yTop + yH*0.22, wHead, yH*0.56, 6);
          ctx.fill();
          ctx.beginPath();
          ctx.roundRect(tailX - wHead/2, yTop + yH*0.22, wHead, yH*0.56, 6);
          ctx.fill();
        }
      }

      // 현재 재생 위치 라인
      const tNow = editorCurrentTime;
      if(tNow >= viewStart && tNow <= viewStart + viewDur){
        const x = (tNow - viewStart) * sx;
        ctx.strokeStyle = "rgba(34,197,94,0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    }

    function editorPosToTLane(clientX, clientY){
      const rect = editorCanvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const t = xToTime(x);
      const rowH = rect.height / laneCount;
      let lane = Math.floor(y / rowH);
      if(lane < 0) lane = 0;
      if(lane >= laneCount) lane = laneCount - 1;
      return { t, lane };
    }

    function findNoteAt(t, lane){
      const w = editorCanvas.width;
      const tolTime = (viewDur / w) * 8; // 대략 8px 정도
      for(let i=chart.length-1;i>=0;i--){
        const n = chart[i];
        if(n.lane !== lane) continue;
        if(n.kind === "tap"){
          if(Math.abs(n.start - t) <= tolTime) return i;
        }else{
          const st = n.start;
          const ed = n.end ?? (n.start+1.6);
          if(t >= st - tolTime && t <= ed + tolTime) return i;
        }
      }
      return -1;
    }

    editorCanvas.addEventListener('mousedown', (e)=>{
      if(!editMode) return;
      const rect = editorCanvas.getBoundingClientRect();
      if(e.clientY < rect.top || e.clientY > rect.bottom) return;

      const {t, lane} = editorPosToTLane(e.clientX, e.clientY);

      // Alt+클릭 = 시점 이동
      if(e.altKey){
        const clamped = Math.max(0, Math.min(songLength, t));
        player?.seekTo?.(clamped, true);
        return;
      }

      const idx = findNoteAt(t, lane);
      editorMouseDown = {
        t0: t, lane0: lane,
        x0: e.clientX, y0: e.clientY,
        noteIdx: idx
      };
    });

    window.addEventListener('mouseup', (e)=>{
      if(!editMode || !editorMouseDown) return;
      const info = editorMouseDown;
      editorMouseDown = null;

      const dx = e.clientX - info.x0;
      const dy = e.clientY - info.y0;
      const moveDist = Math.sqrt(dx*dx + dy*dy);
      const {t, lane} = editorPosToTLane(e.clientX, e.clientY);

      const snapStep = 0.125; // 1/8박 정도
      const snap = (x)=> Math.max(0, Math.min(songLength, Math.round(x/snapStep)*snapStep));

      // 1) 클릭 + 기존 노트 위 = 삭제
      if(moveDist < 4 && info.noteIdx >= 0){
        chart.splice(info.noteIdx, 1);
        loadChart(chart);
        return;
      }

      // 2) 새 노트 생성 (탭/롱)
      const t0 = snap(info.t0);
      const t1 = snap(t);
      const laneUse = info.lane0;
      const dt = Math.abs(t1 - t0);
      const MIN_HOLD = 0.22;

      if(dt < MIN_HOLD){
        chart.push({ lane: laneUse, kind:"tap", start: t0 });
      }else{
        const st = Math.min(t0, t1);
        const ed = Math.max(t0, t1);
        if(ed - st < MIN_HOLD){
          chart.push({ lane: laneUse, kind:"tap", start: t0 });
        }else{
          chart.push({ lane: laneUse, kind:"hold", start: st, end: ed });
        }
      }

      chart.sort((a,b)=> a.start === b.start ? a.lane - b.lane : a.start - b.start);
      loadChart(chart);
    });

    /* ===== 모드 전환 (Play / Edit) ===== */
    function updateModeButtons(){
      if(editMode){
        modeEditBtn.classList.remove('btn2');
        modePlayBtn.classList.add('btn2');
      }else{
        modePlayBtn.classList.remove('btn2');
        modeEditBtn.classList.add('btn2');
      }
    }

    modePlayBtn.addEventListener('click', ()=>{
      editMode = false;
      updateModeButtons();
    });
    modeEditBtn.addEventListener('click', ()=>{
      editMode = true;
      playing = false;
      player?.pauseVideo?.();
      updateModeButtons();
    });

    generateEasyBtn.addEventListener('click', ()=>{
      chart = makeEasyChart();
      loadChart(chart);
      saveChart();
      hardResetForRestart(nowTime() || 0);
    });

    clearChartBtn.addEventListener('click', ()=>{
      chart = [];
      loadChart(chart);
      saveChart();
      hardResetForRestart(nowTime() || 0);
    });

    /* ===== 메인 루프 ===== */
    function loop(){
      syncOverlaySize();
      editorCurrentTime = nowTime() || 0;
      if(playing && !finished && !editMode) updateNotes();
      drawFX();
      drawEditor();
      requestAnimationFrame(loop);
    }

    /* ===== Input (게임) ===== */
    window.addEventListener('keydown', (e) => {
      const lane = keymap.indexOf(e.code);
      if(lane >= 0){
        keyHeld[lane] = true;
        lanePressFx(lane, true);
        onHit(lane);
      }
    });
    window.addEventListener('keyup', (e) => {
      const lane = keymap.indexOf(e.code);
      if(lane >= 0){
        keyHeld[lane] = false;
        lanePressFx(lane, false);
        const h = activeHolds[lane];
        if(h){
          const t = nowTime();
          if(t != null && t < h.end - 0.10) failHoldEarly(lane);
        }
      }
    });

    /* ===== 버튼들 ===== */
    document.getElementById('playBtn').addEventListener('click', () => {
      syncOverlaySize();
      hideResult();
      editMode = false;
      updateModeButtons();
      player?.playVideo?.();
      playing = true;
    });

    document.getElementById('pauseBtn').addEventListener('click', () => {
      player?.pauseVideo?.();
      playing = false;
    });

    document.getElementById('restartBtn').addEventListener('click', () => {
      hardResetForRestart(0);
      setTimeout(() => {
        player?.playVideo?.();
        playing = true;
        editMode = false;
        updateModeButtons();
        showJudge("RESTART", "j-good");
      }, 80);
    });

    ui.resRestartBtn.addEventListener('click', () => document.getElementById('restartBtn').click());
    ui.resCloseBtn.addEventListener('click', () => hideResult());

    /* ===== Init ===== */
    rebuildLanes();
    const storedChart = loadStoredChart();
    chart = storedChart !== null ? storedChart : makeEasyChart();
    loadChart(chart);
    hardResetForRestart(0);
    updateModeButtons();
    loop();









