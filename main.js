// ---------- tiny utils ----------
const $ = (q, r=document)=>r.querySelector(q);
const $$ = (q, r=document)=>r.querySelectorAll(q);
const on = (el, ev, fn)=> el && el.addEventListener(ev, fn);
const setHidden = (el, v)=>{ if(el) el.hidden = !!v; };

// dataURL <-> Blob
const dataURLtoBlob = (dataUrl)=>{
  const [head, body] = dataUrl.split(',');
  const mime = (head.match(/data:(.*?);base64/)||[])[1] || 'image/jpeg';
  const bin = atob(body); const len = bin.length; const u8 = new Uint8Array(len);
  for(let i=0;i<len;i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
};
const blobToObjectURL = (blob)=> URL.createObjectURL(blob);

// unique id
const genId = ()=> (crypto?.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);

// lightweight toast
function toast(msg){
  let t = document.getElementById('toast');
  if(!t){
    t = document.createElement('div');
    t.id='toast';
    Object.assign(t.style,{
      position:'fixed',left:'50%',bottom:'24px',transform:'translateX(-50%)',
      background:'#111a',color:'#fff',padding:'10px 14px',borderRadius:'10px',
      zIndex:99999,backdropFilter:'blur(2px)',fontWeight:'600'
    });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = 1;
  setTimeout(()=>{ t.style.opacity=0; }, 1800);
}

document.addEventListener('DOMContentLoaded', () => {
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
const backdrop = $('#backdrop');
const qrModal = $('#qrModal');
const qrCanvas = $('#qrCanvas');
const btnOpenViewer = $('#btnOpenViewer');
const btnSaveQR = $('#btnSaveQR');
const btnCloseQR = $('#btnCloseQR');
const btnCopyLink = $('#btnCopyLink');
const qrLinkText = $('#qrLinkText');
const frameColor = $('#frameColor');
const frameColorHex = $('#frameColorHex');

/* ===== config ===== */
const MIRROR_FRONT = true;
const AUTO_LIMIT_SEC = 6;
const EXPORT_BASE_W = 1200;  // 1200 x 1800 (2:3)
const DPR_CAP = 2;
const PHOTO_PREFIX = 'photo:';

/* ===== state ===== */
let stream = null;
let shots = [];
let selected = new Set();
let finalDataUrl = null;
let lastQRLink = null;
let facing = 'user';
let shotLock = false;
let renderLock = false;
let autoTimer = null;
let autoRemain = 0;
let flashEl = null;
let bigCountdownEl = null;

/* ===== robust storage: always try IDB first, then LS ===== */
const idb = window.idbKeyval || {};
const ls = {
  set: (k, v)=>{ localStorage.setItem(k, JSON.stringify(v)); },
  get: (k)=>{ const s=localStorage.getItem(k); return s?JSON.parse(s):null; },
  del: (k)=>{ localStorage.removeItem(k); },
  keys: ()=> Object.keys(localStorage),
};

// Keys union
async function dbAllKeys(){
  let a=[], b=[];
  if (idb.keys) {
    try { a = await idb.keys(); } catch(e){ console.warn('[IDB keys fail]', e); }
  }
  try { b = ls.keys(); } catch(e){ console.warn('[LS keys fail]', e); }
  const set = new Set([...(a||[]).map(String), ...(b||[]).map(String)]);
  return [...set].filter(k => k.startsWith(PHOTO_PREFIX));
}

// Write image payload ({id, createdAt, image, type})
async function dbSetImage(k, payload){
  // 1) try IDB (Blob도 저장 가능)
  if (idb.set) {
    try { await idb.set(k, payload); return true; }
    catch(e){ console.warn('[IDB set fail]', e); }
  }
  // 2) fallback LS (dataURL만 추천)
  try { ls.set(k, payload); return true; }
  catch(e){ console.warn('[LS set fail]', e); return false; }
}

// Read image payload
async function dbGetImage(k){
  if (idb.get) {
    try {
      const v = await idb.get(k);
      if (v != null) return v;
    } catch(e){ console.warn('[IDB get fail]', e); }
  }
  try { return ls.get(k); } catch(e){ console.warn('[LS get fail]', e); return null; }
}

// Delete
async function dbDelImage(k){
  if (idb.del) {
    try { await idb.del(k); } catch(e){ console.warn('[IDB del fail]', e); }
  }
  try { ls.del(k); } catch(e){ console.warn('[LS del fail]', e); }
}

/* ===== UI helpers ===== */
function setStep(n){ [...$$('.step')].forEach((el,i)=> el.classList.toggle('active', i===n-1)); }
function updateCounter(){ if(shotCounter) shotCounter.textContent = `${shots.length} / 6`; setStep(shots.length===6?2:1); }
function renderThumbs(){
  if(!thumbGrid) return;
  thumbGrid.innerHTML = '';
  shots.forEach((src, idx)=>{
    const d = document.createElement('div');
    d.className = 'thumb' + (selected.has(idx) ? ' sel' : '');
    d.onclick = ()=>{
      if(selected.has(idx)) selected.delete(idx);
      else if(selected.size < 4) selected.add(idx);
      renderThumbs(); renderPreview();
      if(btnMake) btnMake.disabled = !(selected.size===4);
      if(selected.size===4) setStep(3);
    };
    const img = document.createElement('img'); img.src = src; d.appendChild(img);
    thumbGrid.appendChild(d);
  });
}
function renderPreview(){
  if(!finalGrid) return;
  finalGrid.innerHTML = '';
  [...selected].slice(0,4).forEach(i=>{
    const cell = document.createElement('div'); cell.className = 'cell';
    const img = document.createElement('img'); img.src = shots[i];
    cell.appendChild(img); finalGrid.appendChild(cell);
  });
  if(polaroidCap) polaroidCap.textContent = captionInput?.value || ' ';
}

/* flash & big countdown */
function ensureFlash(){ if(flashEl) return flashEl; flashEl = document.createElement('div'); flashEl.className='flash'; document.body.appendChild(flashEl); return flashEl; }
function triggerFlash(){ const el=ensureFlash(); el.classList.add('active'); setTimeout(()=>el.classList.remove('active'),280); }
function ensureBigCountdown(){ if(bigCountdownEl) return bigCountdownEl; bigCountdownEl=document.createElement('div'); bigCountdownEl.className='big-countdown'; document.body.appendChild(bigCountdownEl); return bigCountdownEl; }
function showBigCountdown(sec){ ensureBigCountdown().textContent = sec>0?sec:''; }
function showCountdown(t){ if(shotCounter) shotCounter.textContent = `${shots.length} / 6  (${t})`; }
function clearCountdown(){ if(shotCounter) shotCounter.textContent = `${shots.length} / 6`; }

/* ===== camera ===== */
async function startCamera(){
  try{
    if (stream) stopCamera();
    const constraints = { video: { facingMode:{ideal:facing}, width:{ideal:1280}, height:{ideal:720} }, audio:false };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (video) {
      video.srcObject = stream;
      video.classList.toggle('mirror', MIRROR_FRONT && (facing==='user'));
    }
    await new Promise(res=>{
      if (video && video.readyState >= 1 && video.videoWidth) return res();
      if (video) video.onloadedmetadata = res; else res();
    });
    if(btnShot) btnShot.disabled = false;
    resetAndStartAutoTimer();
  }catch(e){
    console.error('[camera]', e);
    alert('카메라 접근 실패: 권한/HTTPS를 확인해 주세요.');
  }
}
function stopCamera(){ try{ stream?.getTracks()?.forEach(t=>t.stop()); }catch{} stream=null; stopAutoTimer(); }

on(btnStart,'click', startCamera);
on(btnFlip,'click', async ()=>{ facing = (facing==='user')?'environment':'user'; await startCamera(); });
on(btnReset,'click', ()=>{
  shots=[]; selected=new Set(); finalDataUrl=null; lastQRLink=null;
  if(btnMake) btnMake.disabled = true;
  if(btnSave) btnSave.disabled = true;
  if(btnQR) btnQR.disabled = true;
  renderThumbs(); renderPreview(); updateCounter(); stopAutoTimer();
});
on(captionInput,'input', renderPreview);
on(btnShot,'click', ()=>{ stopAutoTimer(); doCapture(); });

/* ===== auto timer ===== */
function startAutoTimerTick(){
  stopAutoTimer();
  autoRemain = AUTO_LIMIT_SEC;
  showCountdown(autoRemain); showBigCountdown(autoRemain);
  autoTimer = setInterval(()=>{
    autoRemain -= 1;
    if (autoRemain>0){ showCountdown(autoRemain); showBigCountdown(autoRemain); }
    else { stopAutoTimer(); showCountdown(''); showBigCountdown(''); doCapture(); }
  },1000);
}
function resetAndStartAutoTimer(){ stopAutoTimer(); startAutoTimerTick(); }
function stopAutoTimer(){ if(autoTimer){ clearInterval(autoTimer); autoTimer=null; } clearCountdown(); showBigCountdown(''); }

/* ===== capture (mirror-save for front) ===== */
function doCapture(){
  if(shotLock) return;
  if(!stream || shots.length>=6) return;
  if(!video?.videoWidth || !video?.videoHeight){ alert('카메라 초기화 중입니다.'); return; }
  shotLock = true;
  try{
    const w = video.videoWidth, h = video.videoHeight;
    if (hiddenCanvas){ hiddenCanvas.width = w; hiddenCanvas.height = h; }
    const ctx = hiddenCanvas.getContext('2d');
    const mirrorSave = MIRROR_FRONT && (facing === 'user');
    if (mirrorSave){ ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, w, h);
    shots.push(hiddenCanvas.toDataURL('image/jpeg',0.92));
    updateCounter(); renderThumbs(); triggerFlash();
    if(shots.length===6){ if(btnShot) btnShot.disabled=true; stopAutoTimer(); }
    else{ resetAndStartAutoTimer(); }
  } finally { setTimeout(()=> shotLock=false, 120); }
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
  if(frameColor) frameColor.value=h; if(frameColorHex) frameColorHex.value=h;
}
on(frameColor,'input', e=> setPolaroidColor(e.target.value));
on(frameColorHex,'input', e=> setPolaroidColor(e.target.value));
setPolaroidColor(frameColor?.value || '#ffffff');

/* ===== image utils for compose ===== */
function loadImage(src){ return new Promise((resolve,reject)=>{ const img=new Image(); img.onload=()=>resolve(img); img.onerror=()=>reject(new Error('이미지 로드 실패')); img.src=src; }); }
function drawCover(ctx, img, dx, dy, dW, dH){
  const sW = img.naturalWidth || img.width, sH = img.naturalHeight || img.height;
  const sRatio = sW / sH, dRatio = dW / dH;
  let sx=0, sy=0, sw=sW, sh=sH;
  if (sRatio > dRatio) { const newW = sh * dRatio; sx = (sw - newW) / 2; sw = newW; }
  else { const newH = sw / dRatio; sy = (sh - newH) / 2; sh = newH; }
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

/* ===== compose final (2:3) ===== */
async function composeFourcutCanvas(){
  const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
  const outW = Math.round(EXPORT_BASE_W * dpr);
  const outH = Math.round(outW * 1.5);
  const canvas = document.createElement('canvas'); canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext('2d');

  const bg = getComputedStyle(document.documentElement).getPropertyValue('--polaroid-bg').trim() || '#fff';
  const pad = Math.round(32*dpr), gap = Math.round(20*dpr), radius = Math.round(36*dpr);
  const headerH = Math.round(96*dpr), captionH = Math.round(80*dpr), gridPadTop = Math.round(12*dpr);

  ctx.fillStyle = bg; roundRect(ctx, 0, 0, outW, outH, radius); ctx.fill();

  const logoEl = fourcut?.querySelector('.fc-logo');
  const titleText = (fourcut?.querySelector('.fc-title')?.textContent || '').trim();
  if (logoEl) { try{ const logo = await loadImage(logoEl.src); const L = Math.round(64*dpr);
    ctx.drawImage(logo, pad, pad + Math.round((headerH - L)/2), L, L); }catch{} }
  ctx.fillStyle = '#111'; ctx.font = `${Math.round(40*dpr)}px system-ui,-apple-system,Segoe UI,Roboto,Arial`;
  ctx.textBaseline = 'middle'; ctx.fillText(titleText || '', pad + Math.round(80*dpr), pad + Math.round(headerH/2));

  const innerX = pad, innerY = pad + headerH + gridPadTop;
  const innerW = outW - pad*2, innerH = outH - pad - captionH - innerY;
  const cellW = Math.floor((innerW - gap) / 2), cellH = Math.floor(cellW * 4 / 3), rowGap = gap;

  const selIdx = [...selected].slice(0,4);
  const imgs = await Promise.all(selIdx.map(i => loadImage(shots[i])));

  for (let r=0; r<2; r++){
    for (let c=0; c<2; c++){
      const idx = r*2 + c, x = innerX + c*(cellW+gap), y = innerY + r*(cellH+rowGap);
      ctx.save(); ctx.fillStyle='#dbe1ee'; roundRect(ctx, x, y, cellW, cellH, Math.round(24*dpr)); ctx.fill(); ctx.clip();
      const img = imgs[idx]; if (img) drawCover(ctx, img, x, y, cellW, cellH); ctx.restore();
    }
  }

  const cap = (captionInput?.value || '').trim();
  if (cap){
    ctx.fillStyle = '#111'; ctx.font = `700 ${Math.round(34*dpr)}px system-ui,-apple-system,Segoe UI,Roboto,Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(cap, outW/2, outH - Math.round(captionH/2));
  }
  return canvas.toDataURL('image/jpeg', 0.95);
}

/* ===== make / save / qr ===== */
on(btnMake,'click', async ()=>{
  if(selected.size!==4) return alert('4장을 선택하세요');
  if(renderLock) return; renderLock=true; setStep(4);
  try{
    // 1) compose
    finalDataUrl = await composeFourcutCanvas();

    // 2) save (IDB-Blob → fallback LS-dataURL)
    const id = genId();
    let saved = false;
    if (idb.set) {
      try {
        const blob = dataURLtoBlob(finalDataUrl);
        saved = await dbSetImage(`${PHOTO_PREFIX}${id}`, { id, createdAt: Date.now(), image: blob, type:'blob' });
      } catch(e){ console.warn('[blob save fail]', e); }
    }
    if (!saved){
      const ok = await dbSetImage(`${PHOTO_PREFIX}${id}`, { id, createdAt: Date.now(), image: finalDataUrl, type:'dataurl' });
      if (!ok){
        toast('저장소 용량 제한으로 갤러리에 저장하지 못했습니다.');
      }
    }

    if(btnSave) btnSave.disabled=false;
    if(btnQR) btnQR.disabled=false;

    if (gallery && !gallery.hidden) await renderGallery();
  }catch(e){
    console.error('[make]', e); alert('이미지 생성/저장 실패');
  }finally{ renderLock=false; }
});

on(btnSave,'click', ()=>{
  if(!finalDataUrl) return;
  const a=document.createElement('a'); a.href=finalDataUrl; a.download='fourcut.jpg'; a.click();
});

/* ===== QR ===== */
on(btnQR,'click', async ()=>{
  if(!finalDataUrl) return;
  try{
    const link = new URL('viewer.html', location.href).toString() + '#img=' + LZString.compressToEncodedURIComponent(finalDataUrl);
    lastQRLink = link; setHidden(qrModal, false);
    await QRCode.toCanvas(qrCanvas, link, { width:260, errorCorrectionLevel:'M' });
    if(qrLinkText) qrLinkText.textContent = link;
  }catch(e){ console.error('[qr]', e); alert('QR 생성 실패'); setHidden(qrModal, false); }
});
on(btnOpenViewer,'click', ()=>{ if(lastQRLink) window.open(lastQRLink,'_blank'); });
on(btnSaveQR,'click', ()=>{ if(!qrCanvas) return; const a=document.createElement('a'); a.href=qrCanvas.toDataURL('image/png'); a.download='fourcut_qr.png'; a.click(); });
on(btnCopyLink,'click', async ()=>{ try{ await navigator.clipboard.writeText(lastQRLink||''); if(btnCopyLink){ const t=btnCopyLink.textContent; btnCopyLink.textContent='복사됨!'; setTimeout(()=>btnCopyLink.textContent=t,1200);} }catch{} });
on(btnCloseQR,'click', ()=> setHidden(qrModal, true));

/* ===== gallery ===== */
function openGallery(){ if(!gallery||!backdrop) return; gallery.hidden=false; gallery.offsetHeight; gallery.classList.add('open'); backdrop.hidden=false; }
function closeGallerySmooth(){ if(!gallery||!backdrop) return; gallery.classList.remove('open'); setTimeout(()=>{ setHidden(gallery,true); setHidden(backdrop,true); },250); }
on(btnGallery,'click', async ()=>{ await renderGallery(); openGallery(); });
on(btnCloseGallery,'click', closeGallerySmooth);
on(backdrop,'click', closeGallerySmooth);
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && gallery && !gallery.hidden) closeGallerySmooth(); });

on(btnWipeGallery,'click', async ()=>{
  if(!confirm('갤러리를 모두 삭제할까요?')) return;
  const keys = await dbAllKeys();
  for(const k of keys) await dbDelImage(k);
  await renderGallery();
});

async function renderGallery(){
  const grid = $('#galleryGrid'); if(!grid) return; grid.innerHTML='';
  const keys = await dbAllKeys();
  const items = [];
  for(const k of keys){ const v = await dbGetImage(k); if(v) items.push(v); }
  items.sort((a,b)=>b.createdAt-a.createdAt);

  if(items.length===0){
    const empty = document.createElement('div');
    empty.style.cssText = 'grid-column:1/-1;color:#9aa3b2;text-align:center;padding:16px;';
    empty.textContent = '갤러리에 저장된 이미지가 없습니다.';
    grid.appendChild(empty);
  }

  for(const it of items){
    const wrap=document.createElement('div'); wrap.className='g-item';

    const img=document.createElement('img');
    if (it.type === 'blob' && it.image instanceof Blob){
      const url = blobToObjectURL(it.image);
      img.src = url;
      img.onload = img.onerror = ()=> URL.revokeObjectURL(url);
    }else{
      img.src = it.image; // dataURL
    }
    img.alt='saved fourcut'; img.title=new Date(it.createdAt).toLocaleString();
    img.style.cursor='zoom-in'; img.onclick=()=> window.open(img.src,'_blank');

    const del=document.createElement('button'); del.className='del'; del.innerHTML='×';
    del.onclick=async()=>{ if(!confirm('이 이미지를 삭제할까요?')) return; await dbDelImage(`${PHOTO_PREFIX}${it.id}`); await renderGallery(); };

    wrap.appendChild(img); wrap.appendChild(del); grid.appendChild(wrap);
  }
}

/* ===== init ===== */
updateCounter();
}); // DOMContentLoaded
