/* ===== helpers ===== */
const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

/* ===== elements ===== */
const video = $('#video');
const btnStart = $('#btnStart');
const btnShot = $('#btnShot');
const btnFlip = $('#btnFlip');
const btnReset = $('#btnReset');
const shotCounter = $('#shotCounter');
const thumbGrid = $('#thumbGrid');
const btnMake = $('#btnMake');
const btnSave = $('#btnSave');
const btnQR = $('#btnQR');
const fourcut = $('#fourcut');
const finalGrid = $('#finalGrid');
const captionInput = $('#caption');
const polaroidCap = $('#polaroidCap');
const hiddenCanvas = $('#hiddenCanvas');
const btnGallery = $('#btnGallery');
const gallery = $('#gallery');
const btnCloseGallery = $('#btnCloseGallery');
const btnWipeGallery = $('#btnWipeGallery');
const busyEl = $('#busy');
const backdrop = $('#backdrop');

const frameColor = $('#frameColor');
const frameColorHex = $('#frameColorHex');

/* ===== storage (idb → fallback) ===== */
const idb = (window.idbKeyval && typeof window.idbKeyval.set === 'function') ? {
  set: window.idbKeyval.set,
  get: window.idbKeyval.get,
  keys: window.idbKeyval.keys,
  del: window.idbKeyval.del,
} : {
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(_) {} return Promise.resolve(); },
  get: async (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch(_) { return null; } },
  keys: async () => Object.keys(localStorage),
  del: async (k) => { try { localStorage.removeItem(k); } catch(_) {} },
};
const { set: idbSet, get: idbGet, keys: idbKeys, del: idbDel } = idb;

/* ===== state ===== */
let stream = null;
let shots = [];
let selected = new Set();
let finalDataUrl = null;
let lastQRLink = null;
let facing = 'user';
let shotLock = false;

/* 자동 촬영용 */
let autoTimer = null;
let autoRemain = 0;
const AUTO_LIMIT_SEC = 6;

/* 플래시 & 카운트다운 */
let flashEl = null;
let bigCountdownEl = null;

/* ===== UI helpers ===== */
function setStep(n){ [...$$('.step')].forEach((el,i)=> el.classList.toggle('active', i===n-1)); }
function updateCounter(){ shotCounter.textContent = `${shots.length} / 6`; setStep(shots.length===6?2:1); }
function renderThumbs(){
  thumbGrid.innerHTML = '';
  shots.forEach((src, idx)=>{
    const d = document.createElement('div');
    d.className = 'thumb' + (selected.has(idx) ? ' sel' : '');
    d.onclick = ()=>{
      if(selected.has(idx)) selected.delete(idx);
      else if(selected.size < 4) selected.add(idx);
      renderThumbs(); renderPreview();
      btnMake.disabled = !(selected.size===4);
      if(selected.size===4) setStep(3);
    };
    const img = document.createElement('img'); img.src = src; d.appendChild(img);
    thumbGrid.appendChild(d);
  });
}
function renderPreview(){
  finalGrid.innerHTML = '';
  [...selected].slice(0,4).forEach(i=>{
    const cell = document.createElement('div'); cell.className = 'cell';
    const img = document.createElement('img'); img.src = shots[i];
    cell.appendChild(img); finalGrid.appendChild(cell);
  });
  polaroidCap.textContent = captionInput.value || ' ';
}

/* ===== 플래시/카운트다운 ===== */
function ensureFlash(){
  if(flashEl) return flashEl;
  flashEl = document.createElement('div');
  flashEl.className = 'flash';
  document.body.appendChild(flashEl);
  return flashEl;
}
function triggerFlash(){
  const el = ensureFlash();
  el.classList.add('active');
  setTimeout(()=> el.classList.remove('active'), 300);
}
function ensureBigCountdown(){
  if(bigCountdownEl) return bigCountdownEl;
  bigCountdownEl = document.createElement('div');
  bigCountdownEl.className = 'big-countdown';
  document.body.appendChild(bigCountdownEl);
  return bigCountdownEl;
}
function showBigCountdown(sec){
  const el = ensureBigCountdown();
  el.textContent = sec > 0 ? sec : '';
}

/* ===== Camera ===== */
async function startCamera(){
  try{
    if (stream) stopCamera();
    const constraints = { video: { facingMode:{ideal:facing}, width:{ideal:1280}, height:{ideal:720} }, audio:false };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await new Promise(res=>{
      if (video.readyState >= 1 && video.videoWidth) return res();
      video.onloadedmetadata = ()=> res();
    });
    btnShot.disabled = false;

    // 자동 타이머 시작
    resetAndStartAutoTimer();

  }catch(e){
    console.error('getUserMedia error', e);
    let msg='카메라 접근 실패';
    if (e.name==='NotAllowedError'||e.name==='SecurityError') msg='카메라 권한이 차단되어 있습니다. 브라우저/OS 권한을 허용해 주세요.';
    else if (!window.isSecureContext) msg='HTTPS(또는 localhost)에서만 카메라 사용이 가능합니다.';
    else msg += `: ${e.name} ${e.message||''}`;
    alert(msg);
  }
}
function stopCamera(){ try{ stream?.getTracks()?.forEach(t=>t.stop()); }catch{} stream=null; stopAutoTimer(); }

/* ===== Events ===== */
btnStart.onclick = startCamera;
btnFlip.onclick = async ()=>{ facing = (facing==='user')?'environment':'user'; await startCamera(); };
btnReset.onclick = ()=>{
  shots=[]; selected=new Set(); finalDataUrl=null; lastQRLink=null;
  btnMake.disabled = btnSave.disabled = btnQR.disabled = true;
  renderThumbs(); renderPreview(); updateCounter();
  stopAutoTimer();
};
captionInput.addEventListener('input', ()=> renderPreview());

/* Capture */
btnShot.onclick = ()=>{ stopAutoTimer(); doCapture('manual'); };

/* ===== Auto timer ===== */
function startAutoTimerTick(){
  stopAutoTimer();
  autoRemain = AUTO_LIMIT_SEC;
  showCountdown(autoRemain);
  showBigCountdown(autoRemain);
  autoTimer = setInterval(()=>{
    autoRemain -= 1;
    if (autoRemain > 0){
      showCountdown(autoRemain);
      showBigCountdown(autoRemain);
    }else{
      stopAutoTimer();
      showCountdown('');
      showBigCountdown('');
      doCapture('auto');
    }
  }, 1000);
}
function resetAndStartAutoTimer(){
  stopAutoTimer();
  startAutoTimerTick();
}
function stopAutoTimer(){
  if (autoTimer){ clearInterval(autoTimer); autoTimer = null; }
  clearCountdown();
  showBigCountdown('');
}
function showCountdown(t){ shotCounter.textContent = `${shots.length} / 6  (${t})`; }
function clearCountdown(){ shotCounter.textContent = `${shots.length} / 6`; }

/* ===== Capture logic ===== */
function doCapture(source='manual'){
  if(shotLock) return;
  if(!stream || shots.length>=6) return;

  if(!video.videoWidth || !video.videoHeight){
    shotLock = true; setTimeout(()=> shotLock=false, 600);
    if(source==='manual') alert('카메라 초기화 중입니다. 잠시만…');
    return;
  }

  shotLock = true;
  try{
    const w = video.videoWidth, h = video.videoHeight;
    hiddenCanvas.width = w; hiddenCanvas.height = h;
    const ctx = hiddenCanvas.getContext('2d');

    if (facing === 'user'){ // 전면 반전
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();
    }else{
      ctx.drawImage(video, 0, 0, w, h);
    }

    shots.push(hiddenCanvas.toDataURL('image/jpeg',0.9));
    updateCounter(); renderThumbs();

    // ✨ 플래시 효과
    triggerFlash();

    if(shots.length===6){
      btnShot.disabled = true;
      stopAutoTimer();
    }else{
      resetAndStartAutoTimer();
    }
  } finally {
    setTimeout(()=> shotLock=false, 120);
  }
}

/* ===== 나머지(main.js 원본 기능: 프레임색, QR, 갤러리, etc) ===== */
// ... (이 부분은 기존 코드 그대로, 변동 없음)
