/* ====== helpers ====== */
const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

/* ====== elements ====== */
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

/* color controls */
const colR = $('#colR'), colG = $('#colG'), colB = $('#colB'), colHex = $('#colHex'), btnApplyColor = $('#btnApplyColor');

/* overlay controls */
const frameFile = $('#frameFile');
const frameOverlay = $('#frameOverlay');
const btnOverlayToggle = $('#btnOverlayToggle');
const btnOverlayRemove = $('#btnOverlayRemove');

/* ====== storage (idb → localStorage fallback) ====== */
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

/* ====== state ====== */
let stream = null;
let shots = [];            // captured dataURLs (max 6)
let selected = new Set();  // indexes of chosen 4
let finalDataUrl = null;
let lastQRLink = null;
let facing = 'user';       // 'user' | 'environment'

/* ====== UI helpers ====== */
function setStep(n){
  const steps = [...$$('.step')];
  steps.forEach((el,i)=> el.classList.toggle('active', i===n-1));
}
function updateCounter(){
  shotCounter.textContent = `${shots.length} / 6`;
  setStep(shots.length === 6 ? 2 : 1);
}
function renderThumbs(){
  thumbGrid.innerHTML = '';
  shots.forEach((src, idx)=>{
    const d = document.createElement('div');
    d.className = 'thumb' + (selected.has(idx) ? ' sel' : '');
    d.onclick = ()=>{
      if(selected.has(idx)) selected.delete(idx);
      else if(selected.size < 4) selected.add(idx);
      renderThumbs();
      renderPreview();
      btnMake.disabled = !(selected.size===4);
      if(selected.size===4) setStep(3);
    };
    const img = document.createElement('img');
    img.src = src;
    d.appendChild(img);
    thumbGrid.appendChild(d);
  });
}
function renderPreview(){
  finalGrid.innerHTML = '';
  [...selected].slice(0,4).forEach(i=>{
    const cell = document.createElement('div');
    cell.className = 'cell';
    const img = document.createElement('img');
    img.src = shots[i];
    cell.appendChild(img);
    finalGrid.appendChild(cell);
  });
  polaroidCap.textContent = captionInput.value || ' ';
}

/* ====== frame color ====== */
function rgbToHex(r,g,b){
  const to = (n)=> Math.max(0, Math.min(255, n|0));
  return '#' + [to(r),to(g),to(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function hexToRgb(hex){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r:parseInt(m[1],16), g:parseInt(m[2],16), b:parseInt(m[3],16) } : {r:255,g:255,b:255};
}
function applyFrameColor(r,g,b){
  const c = `rgb(${r}, ${g}, ${b})`;
  fourcut.style.setProperty('--frame-bg', c);

  // 밝기에 따라 글자색(light/dark) 자동
  const luma = 0.2126*r + 0.7152*g + 0.0722*b;
  fourcut.classList.remove('light','dark');
  fourcut.classList.add(luma < 140 ? 'dark' : 'light');

  idbSet('frameColor', {r,g,b}).catch(()=>{});
}
function syncFromNumbers(){
  const r = +colR.value||0, g = +colG.value||0, b = +colB.value||0;
  colHex.value = rgbToHex(r,g,b);
  applyFrameColor(r,g,b);
}
function syncFromHex(){
  const {r,g,b} = hexToRgb(colHex.value);
  colR.value = r; colG.value = g; colB.value = b;
  applyFrameColor(r,g,b);
}
btnApplyColor.onclick = syncFromNumbers;
colHex.addEventListener('input', syncFromHex);

/* ====== overlay upload ====== */
frameFile.addEventListener('change', async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    frameOverlay.src = reader.result;
    frameOverlay.hidden = false;
    btnOverlayToggle.disabled = false;
    btnOverlayRemove.disabled = false;
    idbSet('overlayPng', reader.result);
  };
  reader.readAsDataURL(file);
});
btnOverlayToggle.onclick = ()=>{
  if(frameOverlay.hidden){
    frameOverlay.hidden = false;
    btnOverlayToggle.textContent = '오버레이 끄기';
  }else{
    frameOverlay.hidden = true;
    btnOverlayToggle.textContent = '오버레이 켜기';
  }
};
btnOverlayRemove.onclick = async ()=>{
  frameOverlay.src = '';
  frameOverlay.hidden = true;
  btnOverlayToggle.disabled = true;
  btnOverlayRemove.disabled = true;
  await idbDel('overlayPng');
  frameFile.value = '';
};

/* ====== camera ====== */
async function startCamera(){
  try{
    if (stream) stopCamera();

    const constraints = {
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    // 메타데이터 로드 대기 (desktop 비율 깨짐 방지)
    await new Promise(resolve=>{
      if (video.readyState >= 1 && video.videoWidth) return resolve();
      video.onloadedmetadata = ()=> resolve();
    });

    btnShot.disabled = false;
  }catch(e){
    console.error('getUserMedia error', e);
    let msg = '카메라 접근 실패';
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
      msg = '카메라 권한이 차단되어 있습니다. 브라우저/OS 권한을 확인하세요.';
    } else if (!window.isSecureContext) {
      msg = 'HTTPS(또는 localhost)에서만 카메라 사용이 가능합니다.';
    } else {
      msg = `${e.name} ${e.message || ''}`;
    }
    alert(msg);
  }
}
function stopCamera(){
  try{ stream?.getTracks()?.forEach(t=>t.stop()); }catch{}
  stream = null;
}

/* ====== event wiring ====== */
btnStart.onclick = startCamera;
btnFlip.onclick = async ()=>{ facing = (facing === 'user') ? 'environment' : 'user'; await startCamera(); };
btnReset.onclick = ()=>{
  shots = [];
  selected = new Set();
  finalDataUrl = null;
  lastQRLink = null;
  btnMake.disabled = true;
  btnSave.disabled = true;
  btnQR.disabled = true;
  renderThumbs();
  renderPreview();
  updateCounter();
};

btnShot.onclick = ()=>{
  if(!stream) return;
  if(shots.length >= 6) return;

  if(!video.videoWidth || !video.videoHeight){
    alert("카메라 초기화 중입니다. 잠시 후 다시 시도하세요.");
    return;
  }

  // 데스크톱/패드에서도 정확한 원본 해상도 캡처
  const w = video.videoWidth;
  const h = video.videoHeight;

  hiddenCanvas.width = w;
  hiddenCanvas.height = h;

  const ctx = hiddenCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);

  const dataUrl = hiddenCanvas.toDataURL('image/jpeg', 0.9);
  shots.push(dataUrl);

  updateCounter();
  renderThumbs();
  if(shots.length===6) btnShot.disabled = true;
};

captionInput.addEventListener('input', renderPreview);

/* ====== 이미지 로드 대기 유틸 ====== */
function waitForImages(container, timeout=7000){
  const imgs = [...container.querySelectorAll('img')].filter(img=>!img.hidden);
  const pending = imgs.filter(img=>!img.complete);
  if(!pending.length) return Promise.resolve();

  return new Promise((resolve, reject)=>{
    const to = setTimeout(()=>reject(new Error('images timeout')), timeout);
    let count = 0;
    pending.forEach(img=>{
      img.addEventListener('load', done, {once:true});
      img.addEventListener('error', done, {once:true});
    });
    function done(){ count++; if(count===pending.length){ clearTimeout(to); resolve(); } }
  });
}

/* ====== make final image ====== */
btnMake.onclick = async ()=>{
  if(selected.size!==4) return alert('4장을 선택하세요');
  if(!window.htmlToImage){
    alert('이미지 생성 모듈이 로드되지 않았습니다.');
    return;
  }

  setStep(4);
  busyEl.hidden = false;

  try{
    // 폰트 & 이미지 모두 준비될 때까지 대기
    if (document.fonts && document.fonts.ready) {
      try { await Promise.race([document.fonts.ready, new Promise((_,rej)=>setTimeout(()=>rej(new Error('fonts timeout')), 3000))]); } catch(_) {}
    }
    await waitForImages(fourcut, 8000);

    // 정확한 사이즈로 고정해서 캡처(데스크톱 크롭 수정)
    const rect = fourcut.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    const filter = (node) => !(node.id === 'busy' || node.classList?.contains('busy'));

    // toJpeg에 타임아웃 가드
    const jpegPromise = htmlToImage.toJpeg(fourcut, {
      quality: 0.95,
      width, height,
      canvasWidth: width, canvasHeight: height,
      pixelRatio: 1,                 // 높은 비율은 QR/메모리 부담 ↑
      backgroundColor: null,
      cacheBust: true,
      style: { width: `${width}px`, height: `${height}px`, transform: 'none' },
      filter
    });
    const dataUrl = await Promise.race([
      jpegPromise,
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('render timeout')), 12000))
    ]);

    finalDataUrl = dataUrl;

    btnSave.disabled = false;
    btnQR.disabled = false;

    const id = crypto.randomUUID();
    await idbSet(`photo:${id}`, { id, createdAt: Date.now(), image: finalDataUrl });
  }catch(e){
    console.error('make fourcut error', e);
    alert('이미지 생성 실패: ' + (e?.message || e));
  }finally{
    busyEl.hidden = true;
  }
};

/* save button */
btnSave.onclick = ()=>{
  if(!finalDataUrl) return;
  const a = document.createElement('a');
  a.href = finalDataUrl; a.download = 'fourcut.jpg'; a.click();
};

/* ====== QR modal ====== */
const qrModal = $('#qrModal');
const qrCanvas = $('#qrCanvas');
const btnOpenViewer = $('#btnOpenViewer');
const btnSaveQR = $('#btnSaveQR');
const btnCloseQR = $('#btnCloseQR');
const btnCopyLink = $('#btnCopyLink');
const qrLinkText = $('#qrLinkText');

btnQR.onclick = async ()=>{
  if(!finalDataUrl) return;
  try{
    const compressed = LZString.compressToEncodedURIComponent(finalDataUrl);
    const viewerURL = new URL('viewer.html', location.href).toString() + '#img=' + compressed;

    lastQRLink = viewerURL;
    qrModal.hidden = false;
    await QRCode.toCanvas(qrCanvas, viewerURL, { width: 260, errorCorrectionLevel: 'M' });
    qrLinkText.textContent = viewerURL;
  }catch(e){
    console.error('QR generate error', e);
    alert('QR 생성 중 오류: ' + (e?.message || e));
    qrModal.hidden = false;
  }
};
btnOpenViewer?.addEventListener('click', ()=>{ if(lastQRLink) window.open(lastQRLink, '_blank'); });
btnSaveQR?.addEventListener('click', ()=>{
  const dataUrl = qrCanvas.toDataURL('image/png');
  const a = document.createElement('a'); a.href = dataUrl; a.download = 'fourcut_qr.png'; a.click();
});
btnCopyLink?.addEventListener('click', async ()=>{
  try{ await navigator.clipboard.writeText(lastQRLink || ''); btnCopyLink.textContent = '복사됨!'; setTimeout(()=> btnCopyLink.textContent = '링크 복사', 1200); }catch{}
});
btnCloseQR?.addEventListener('click', ()=>{ qrModal.hidden = true; });

/* ====== gallery drawer ====== */
function closeGallerySmooth(){
  gallery.classList.remove('open');
  setTimeout(()=>{
    gallery.hidden = true;
    backdrop.hidden = true;
  }, 250);
}
btnGallery.onclick = async ()=>{
  await renderGallery();
  gallery.hidden = false;
  gallery.offsetHeight;
  gallery.classList.add('open');
  backdrop.hidden = false;
};
btnCloseGallery.onclick = closeGallerySmooth;
backdrop.onclick = closeGallerySmooth;
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && !gallery.hidden) closeGallerySmooth(); });

/* 전체 삭제 */
btnWipeGallery.onclick = async ()=>{
  if(!confirm('갤러리를 모두 삭제할까요?')) return;
  const keys = await idbKeys();
  for (const k of keys) { if (String(k).startsWith('photo:')) await idbDel(k); }
  await renderGallery();
  alert('삭제 완료');
};

/* ====== render gallery ====== */
async function renderGallery(){
  const grid = $('#galleryGrid'); grid.innerHTML='';
  const keys = await idbKeys();
  const items = [];
  for(const k of keys){ if(String(k).startsWith('photo:')) items.push(await idbGet(k)); }
  items.sort((a,b)=>b.createdAt-a.createdAt);
  for(const it of items){
    const wrap = document.createElement('div');
    wrap.className = 'g-item';
    const img = document.createElement('img');
    img.src = it.image; img.title = new Date(it.createdAt).toLocaleString();

    const del = document.createElement('button');
    del.className = 'del';
    del.innerHTML = '×';
    del.onclick = async ()=>{
      if(!confirm('이 이미지를 삭제할까요?')) return;
      await idbDel(`photo:${it.id}`);
      await renderGallery();
    };

    wrap.appendChild(img);
    wrap.appendChild(del);
    grid.appendChild(wrap);
  }
}

/* ====== init ====== */
updateCounter();
renderPreview();

// 컬러/오버레이 복원
(async ()=>{
  const saved = await idbGet('frameColor');
  if (saved){
    colR.value = saved.r; colG.value = saved.g; colB.value = saved.b;
    colHex.value = rgbToHex(saved.r, saved.g, saved.b);
    applyFrameColor(saved.r, saved.g, saved.b);
  } else {
    syncFromHex();
  }
  const ov = await idbGet('overlayPng');
  if (ov){
    frameOverlay.src = ov; frameOverlay.hidden = false;
    btnOverlayToggle.disabled = false;
    btnOverlayRemove.disabled = false;
  }
})();
