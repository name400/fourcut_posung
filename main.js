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
const fourcut = $('#fourcut');          // 프리뷰(레이아웃 참고용)
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

/* ===== config ===== */
const MIRROR_FRONT = true;       // 전면 카메라 미리보기/저장 모두 거울모드
const AUTO_LIMIT_SEC = 6;        // 자동 촬영 카운트다운
const EXPORT_BASE_W = 1200;      // 결과 이미지 기준 폭(px) 2:3 비율 → 1200x1800 기본
const DPR_CAP = 2;               // 과한 해상도 방지

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
let facing = 'user';    // 'user' | 'environment'
let shotLock = false;
let renderLock = false;

/* auto timer */
let autoTimer = null;
let autoRemain = 0;

/* flash & big countdown */
let flashEl = null;
let bigCountdownEl = null;

/* ===== UI ===== */
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

/* ===== flash & big countdown ===== */
function ensureFlash(){ if(flashEl) return flashEl; flashEl = document.createElement('div'); flashEl.className='flash'; document.body.appendChild(flashEl); return flashEl; }
function triggerFlash(){ const el=ensureFlash(); el.classList.add('active'); setTimeout(()=>el.classList.remove('active'),280); }
function ensureBigCountdown(){ if(bigCountdownEl) return bigCountdownEl; bigCountdownEl=document.createElement('div'); bigCountdownEl.className='big-countdown'; document.body.appendChild(bigCountdownEl); return bigCountdownEl; }
function showBigCountdown(sec){ ensureBigCountdown().textContent = sec>0?sec:''; }

/* ===== camera ===== */
async function startCamera(){
  try{
    if (stream) stopCamera();
    const constraints = { video: { facingMode:{ideal:facing}, width:{ideal:1280}, height:{ideal:720} }, audio:false };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    // 전면 미리보기: 거울모드
    const mirrorPreview = MIRROR_FRONT && (facing === 'user');
    video.classList.toggle('mirror', mirrorPreview);

    await new Promise(res=>{
      if (video.readyState >= 1 && video.videoWidth) return res();
      video.onloadedmetadata = res;
    });

    btnShot.disabled = false;
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

btnStart?.addEventListener('click', startCamera);
btnFlip?.addEventListener('click', async ()=>{ facing = (facing==='user')?'environment':'user'; await startCamera(); });
btnReset?.addEventListener('click', ()=>{
  shots=[]; selected=new Set(); finalDataUrl=null; lastQRLink=null;
  btnMake.disabled = btnSave.disabled = btnQR.disabled = true;
  renderThumbs(); renderPreview(); updateCounter(); stopAutoTimer();
});
captionInput?.addEventListener('input', renderPreview);
btnShot?.addEventListener('click', ()=>{ stopAutoTimer(); doCapture(); });

/* ===== auto timer ===== */
function startAutoTimerTick(){
  stopAutoTimer();
  autoRemain = AUTO_LIMIT_SEC;
  showCountdown(autoRemain); showBigCountdown(autoRemain);
  autoTimer = setInterval(()=>{
    autoRemain -= 1;
    if (autoRemain>0){ showCountdown(autoRemain); showBigCountdown(autoRemain); }
    else{ stopAutoTimer(); showCountdown(''); showBigCountdown(''); doCapture(); }
  },1000);
}
function resetAndStartAutoTimer(){ stopAutoTimer(); startAutoTimerTick(); }
function stopAutoTimer(){ if(autoTimer){ clearInterval(autoTimer); autoTimer=null; } clearCountdown(); showBigCountdown(''); }
function showCountdown(t){ shotCounter.textContent = `${shots.length} / 6  (${t})`; }
function clearCountdown(){ shotCounter.textContent = `${shots.length} / 6`; }

/* ===== capture (미리보기=거울, 저장도 동일 방향) ===== */
function doCapture(){
  if(shotLock) return;
  if(!stream || shots.length>=6) return;
  if(!video.videoWidth || !video.videoHeight){ alert('카메라 초기화 중입니다.'); return; }

  shotLock = true;
  try{
    const w = video.videoWidth, h = video.videoHeight;
    hiddenCanvas.width = w; hiddenCanvas.height = h;
    const ctx = hiddenCanvas.getContext('2d');

    // 전면은 저장도 거울방향 유지
    const mirrorSave = MIRROR_FRONT && (facing === 'user');
    if (mirrorSave){ ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, w, h);

    shots.push(hiddenCanvas.toDataURL('image/jpeg',0.92));
    updateCounter(); renderThumbs(); triggerFlash();

    if(shots.length===6){ btnShot.disabled=true; stopAutoTimer(); }
    else{ resetAndStartAutoTimer(); }
  } finally {
    setTimeout(()=> shotLock=false, 120);
  }
}

/* ===== color ===== */
function sanitizeHex(v){ let s=v.trim(); if(!s.startsWith('#')) s='#'+s; if(s.length===4) s='#'+s[1]+s[1]+s[2]+s[2]+s[3]+s[3]; return /^#([0-9a-f]{6})$/i.test(s)?s.toLowerCase():'#ffffff'; }
function setPolaroidColor(hex){
  const h=sanitizeHex(hex);
  document.documentElement.style.setProperty('--polaroid-bg', h);
  const r=parseInt(h.substr(1,2),16), g=parseInt(h.substr(3,2),16), b=parseInt(h.substr(5,2),16);
  const L=(0.2126*r+0.7152*g+0.0722*b)/255;
  document.documentElement.style.setProperty('--busy-bg', L<0.5?'#00000099':'#ffffffcc');
  document.documentElement.style.setProperty('--busy-fg', L<0.5?'#ffffff':'#111111');
  frameColor.value=h; frameColorHex.value=h;
}
frameColor?.addEventListener('input', e=> setPolaroidColor(e.target.value));
frameColorHex?.addEventListener('input', e=> setPolaroidColor(e.target.value));
setPolaroidColor(frameColor?.value || '#ffffff');

/* ===== utils ===== */
function loadImage(src){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.onerror = ()=> reject(new Error('이미지 로드 실패'));
    img.src = src;
  });
}
/** object-fit: cover 처럼 drawImage */
function drawCover(ctx, img, dx, dy, dW, dH){
  const sW = img.naturalWidth || img.width;
  const sH = img.naturalHeight || img.height;
  const sRatio = sW / sH;
  const dRatio = dW / dH;
  let sx=0, sy=0, sw=sW, sh=sH;
  if (sRatio > dRatio) {
    // 소스가 더 가로로 김 → 좌우 자르기
    const newW = sh * dRatio;
    sx = (sw - newW) / 2;
    sw = newW;
  } else {
    // 소스가 더 세로로 김 → 상하 자르기
    const newH = sw / dRatio;
    sy = (sh - newH) / 2;
    sh = newH;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dW, dH);
}
function roundRect(ctx, x, y, w, h, r){
  const radius = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+radius, y);
  ctx.arcTo(x+w, y, x+w, y+h, radius);
  ctx.arcTo(x+w, y+h, x, y+h, radius);
  ctx.arcTo(x, y+h, x, y, radius);
  ctx.arcTo(x, y, x+w, y, radius);
  ctx.closePath();
}

/* ===== 캔버스 합성 (잘림/무한로딩 근본 해결) ===== */
async function composeFourcutCanvas(){
  // 1) 출력 캔버스 크기 결정 (2:3 고정)
  const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
  const outW = Math.round(EXPORT_BASE_W * dpr);
  const outH = Math.round(outW * 1.5);         // 2:3

  const canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext('2d');

  // 2) 스타일 참조
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--polaroid-bg').trim() || '#fff';
  const pad = Math.round(32 * dpr);            // 바깥 패딩
  const gap = Math.round(20 * dpr);            // 셀 사이 간격
  const radius = Math.round(36 * dpr);         // 폴라로이드 모서리
  const headerH = Math.round(96 * dpr);        // 상단 로고+제목 영역
  const captionH = Math.round(80 * dpr);       // 하단 캡션 영역
  const gridPadTop = Math.round(12 * dpr);

  // 3) 배경(라운드 카드)
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, outW, outH, radius); ctx.fill();

  // 4) 상단 로고/타이틀
  const logoEl = fourcut.querySelector('.fc-logo');
  const titleText = (fourcut.querySelector('.fc-title')?.textContent || '').trim();
  if (logoEl) {
    try {
      const logo = await loadImage(logoEl.src);
      const lSize = Math.round(64 * dpr);
      ctx.drawImage(logo, pad, pad + Math.round((headerH - lSize)/2), lSize, lSize);
    } catch {}
  }
  ctx.fillStyle = '#111';
  ctx.font = `${Math.round(40*dpr)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.textBaseline = 'middle';
  ctx.fillText(titleText || '', pad + Math.round(80*dpr), pad + Math.round(headerH/2));

  // 5) 2x2 그리드
  const innerX = pad;
  const innerY = pad + headerH + gridPadTop;
  const innerW = outW - pad*2;
  const innerH = outH - pad - captionH - innerY;

  const cellW = Math.floor((innerW - gap) / 2);
  const cellH = Math.floor(cellW * 4 / 3);     // 3:4 비율 셀
  const rowGap = gap;

  const selIdx = [...selected].slice(0,4);
  const imgs = await Promise.all(selIdx.map(i => loadImage(shots[i])));

  for (let r=0; r<2; r++){
    for (let c=0; c<2; c++){
      const idx = r*2 + c;
      const x = innerX + c * (cellW + gap);
      const y = innerY + r * (cellH + rowGap);

      // 셀 베이스(배경)
      ctx.save();
      ctx.fillStyle = '#dbe1ee';
      roundRect(ctx, x, y, cellW, cellH, Math.round(24*dpr)); ctx.fill();
      ctx.clip();
      // 이미지 cover
      const img = imgs[idx];
      if (img) drawCover(ctx, img, x, y, cellW, cellH);
      ctx.restore();
    }
  }

  // 6) 하단 캡션
  const cap = (captionInput?.value || '').trim();
  if (cap){
    ctx.fillStyle = '#111';
    ctx.font = `700 ${Math.round(34*dpr)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cap, outW/2, outH - Math.round(captionH/2));
  }

  return canvas.toDataURL('image/jpeg', 0.95);
}

/* ===== make / save / qr ===== */
btnMake?.addEventListener('click', async ()=>{
  if(selected.size!==4) return alert('4장을 선택하세요');
  if(renderLock) return;
  renderLock = true;
  setStep(4);
  busyEl && (busyEl.hidden = false);

  try{
    // 캔버스 합성(빠르고 안정적)
    finalDataUrl = await composeFourcutCanvas();

    btnSave.disabled = btnQR.disabled = false;

    // 갤러리 저장
    const id = crypto.randomUUID();
    await idbSet(`photo:${id}`, { id, createdAt: Date.now(), image: finalDataUrl });
  }catch(e){
    console.error(e);
    alert('이미지 생성 실패: ' + (e?.message||e));
  }finally{
    if (busyEl) busyEl.hidden = true;  // ✅ 항상 해제
    renderLock = false;
  }
});

btnSave?.addEventListener('click', ()=>{
  if(!finalDataUrl) return;
  const a=document.createElement('a'); a.href=finalDataUrl; a.download='fourcut.jpg'; a.click();
});

/* ===== QR ===== */
const qrModal = $('#qrModal'); const qrCanvas = $('#qrCanvas');
const btnOpenViewer = $('#btnOpenViewer'); const btnSaveQR = $('#btnSaveQR');
const btnCloseQR = $('#btnCloseQR'); const btnCopyLink = $('#btnCopyLink'); const qrLinkText = $('#qrLinkText');

btnQR?.addEventListener('click', async ()=>{
  if(!finalDataUrl) return;
  try{
    const link = new URL('viewer.html', location.href).toString() + '#img=' + LZString.compressToEncodedURIComponent(finalDataUrl);
    lastQRLink = link; qrModal.hidden=false;
    await QRCode.toCanvas(qrCanvas, link, { width:260, errorCorrectionLevel:'M' });
    qrLinkText.textContent = link;
  }catch(e){ console.error(e); alert('QR 생성 중 오류'); qrModal.hidden=false; }
});
btnOpenViewer?.addEventListener('click', ()=>{ if(lastQRLink) window.open(lastQRLink,'_blank'); });
btnSaveQR?.addEventListener('click', ()=>{ const a=document.createElement('a'); a.href=qrCanvas.toDataURL('image/png'); a.download='fourcut_qr.png'; a.click(); });
btnCopyLink?.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(lastQRLink||''); btnCopyLink.textContent='복사됨!'; setTimeout(()=>btnCopyLink.textContent='링크 복사',1200);}catch{} });
btnCloseQR?.addEventListener('click', ()=>{ qrModal.hidden=true; });

/* ===== gallery ===== */
function closeGallerySmooth(){ gallery.classList.remove('open'); setTimeout(()=>{ gallery.hidden=true; backdrop.hidden=true; },250); }
btnGallery?.addEventListener('click', async ()=>{ await renderGallery(); gallery.hidden=false; gallery.offsetHeight; gallery.classList.add('open'); backdrop.hidden=false; });
btnCloseGallery?.addEventListener('click', closeGallerySmooth);
backdrop?.addEventListener('click', closeGallerySmooth);
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !gallery.hidden) closeGallerySmooth(); });

btnWipeGallery?.addEventListener('click', async ()=>{
  if(!confirm('갤러리를 모두 삭제할까요?')) return;
  const keys = await idbKeys();
  for(const k of keys) if(String(k).startsWith('photo:')) await idbDel(k);
  await renderGallery();
});

async function renderGallery(){
  const grid = $('#galleryGrid'); if(!grid) return; grid.innerHTML='';
  const keys = await idbKeys();
  const items = [];
  for(const k of keys){ if(String(k).startsWith('photo:')) items.push(await idbGet(k)); }
  items.sort((a,b)=>b.createdAt-a.createdAt);

  for(const it of items){
    if(!it || !it.image) continue;

    // ✅ 썸네일 래퍼(2:3 비율)
    const wrap = document.createElement('div');
    wrap.className = 'g-item';

    // ✅ 이미지: contain으로 표시
    const img = document.createElement('img');
    img.src = it.image;
    img.alt = 'saved fourcut';
    img.title = new Date(it.createdAt).toLocaleString();
    // 원본 새 탭 열기(편의)
    img.style.cursor = 'zoom-in';
    img.onclick = () => window.open(it.image, '_blank');

    // 삭제 버튼
    const del = document.createElement('button');
    del.className = 'del';
    del.innerHTML = '×';
    del.onclick = async () => {
      if(!confirm('이 이미지를 삭제할까요?')) return;
      await idbDel(`photo:${it.id}`);
      await renderGallery();
    };

    wrap.appendChild(img);
    wrap.appendChild(del);
    grid.appendChild(wrap);
  }
}


/* ===== init ===== */
updateCounter();

