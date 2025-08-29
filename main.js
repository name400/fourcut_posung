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

/* ===== config ===== */
const MIRROR_FRONT = true;          // 전면 카메라 미리보기/저장을 ‘거울모드’로
const AUTO_LIMIT_SEC = 6;           // 자동 촬영 카운트다운
const RENDER_TIMEOUT_MS = 15000;    // 이미지 렌더 타임아웃(ms)

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

    // 전면 미리보기: 거울모드(한 번만 적용)
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

/* ===== capture ===== */
function doCapture(){
  if(shotLock) return;
  if(!stream || shots.length>=6) return;
  if(!video.videoWidth || !video.videoHeight){ alert('카메라 초기화 중입니다.'); return; }

  shotLock = true;
  try{
    const w = video.videoWidth, h = video.videoHeight;
    hiddenCanvas.width = w; hiddenCanvas.height = h;
    const ctx = hiddenCanvas.getContext('2d');

    // 저장본도 ‘미리보기와 같은’ 거울모드 1회만 적용
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

/* ===== image helpers ===== */
function waitImage(img){ return new Promise((res,rej)=>{ if(img.complete&&img.naturalWidth>0) return res(); img.onload=res; img.onerror=()=>rej(new Error('이미지 로드 실패')); }); }

/* ===== offscreen stable render (잘림 방지) ===== */
async function renderFourcutStable(){
  // 폰트 대기(최대 3초)
  if(document.fonts?.ready){
    try{ await Promise.race([document.fonts.ready, new Promise((_,rej)=>setTimeout(()=>rej(0),3000))]); }catch{}
  }

  // scrollWidth/Height로 CSS max-width 영향 제거
  const srcW = Math.max(1, fourcut.scrollWidth || fourcut.offsetWidth);
  const srcH = Math.max(1, fourcut.scrollHeight || fourcut.offsetHeight);

  // 1) 캡처 전용 복제
  const clone = fourcut.cloneNode(true);
  Object.assign(clone.style,{
    position:'fixed',
    left:'-9999px',
    top:'0',
    width:srcW+'px',
    height:srcH+'px',
    maxWidth:'none',
    maxHeight:'none',
    transform:'none',
    overflow:'hidden',
    zIndex:'-1'
  });
  // busy 제거
  clone.querySelectorAll('.busy').forEach(n=>n.remove());
  document.body.appendChild(clone);

  // 내부 이미지 로드
  const imgs=[...clone.querySelectorAll('img')];
  await Promise.all(imgs.map(img=>img.decode?img.decode().catch(()=>waitImage(img)):waitImage(img)));

  // 2) 렌더 (배율 1로 고정 → 메모리/잘림 이슈 방지)
  const dataUrl = await htmlToImage.toJpeg(clone,{
    quality:0.95,
    width:srcW,
    height:srcH,
    canvasWidth:srcW,
    canvasHeight:srcH,
    pixelRatio:1,
    cacheBust:true,
    filter:(n)=>!(n?.classList?.contains?.('busy')||n?.id==='busy'),
    backgroundColor:getComputedStyle(document.documentElement).getPropertyValue('--polaroid-bg') || '#fff'
  });

  // 3) 정리
  document.body.removeChild(clone);
  return dataUrl;
}

/* ===== make / save / qr ===== */
btnMake?.addEventListener('click', async ()=>{
  if(selected.size!==4) return alert('4장을 선택하세요');
  if(!window.htmlToImage) return alert('이미지 모듈 로드 실패. 새로고침 해주세요.');
  if(renderLock) return; renderLock=true;
  setStep(4); busyEl.hidden=false;

  try{
    finalDataUrl = await Promise.race([
      renderFourcutStable(),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('render-timeout')), RENDER_TIMEOUT_MS))
    ]);
    btnSave.disabled = btnQR.disabled = false;

    const id = crypto.randomUUID();
    await idbSet(`photo:${id}`, { id, createdAt: Date.now(), image: finalDataUrl });
  }catch(e){
    console.error(e);
    alert('이미지 생성 실패: ' + (e?.message||e));
  }finally{
    // ✅ 어떤 경우에도 로딩/락 해제
    busyEl.hidden = true;
    setTimeout(()=> busyEl.hidden = true, 80);
    renderLock=false;
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
    if(!it) continue;
    const wrap=document.createElement('div'); wrap.className='g-item';
    const img=document.createElement('img'); img.src=it.image; img.title=new Date(it.createdAt).toLocaleString();
    const del=document.createElement('button'); del.className='del'; del.innerHTML='×';
    del.onclick=async()=>{ if(!confirm('이 이미지를 삭제할까요?')) return; await idbDel(`photo:${it.id}`); await renderGallery(); };
    wrap.appendChild(img); wrap.appendChild(del); grid.appendChild(wrap);
  }
}

/* ===== init ===== */
updateCounter();
