const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
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
const busyEl = $('#busy');

/* ---------- idb-keyval 가드 (로컬스토리지 폴백) ---------- */
const idb = (window.idbKeyval && typeof window.idbKeyval.set === 'function') ? {
  set: window.idbKeyval.set,
  get: window.idbKeyval.get,
  keys: window.idbKeyval.keys
} : {
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(_) {} return Promise.resolve(); },
  get: async (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch(_) { return null; } },
  keys: async () => Object.keys(localStorage).filter(k => k.startsWith('photo:'))
};
const { set: idbSet, get: idbGet, keys: idbKeys } = idb;

let stream = null;
let shots = [];            // captured dataURLs (max 6)
let selected = new Set();  // indexes of chosen 4
let finalDataUrl = null;
let lastQRLink = null;
let facing = 'user';       // or 'environment'

function setStep(n){
  const steps = [...$$('.step')];
  steps.forEach((el,i)=> el.classList.toggle('active', i===n-1));
}

async function startCamera(){
  try{
    if (stream) stopCamera();
    // HTTPS 또는 localhost 권장 (file:// / http:// 환경에서 차단 가능)
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
    video.srcObject = stream;
    btnShot.disabled = false;
  }catch(e){
    console.error('getUserMedia error', e);
    alert('카메라 접근 실패: ' + (e?.name || '') + ' ' + (e?.message || '보안 정책 때문에 차단됐을 수 있어요. HTTPS/localhost에서 실행하세요.'));
  }
}
function stopCamera(){
  try{ stream?.getTracks()?.forEach(t=>t.stop()); }catch{}
  stream = null;
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
  polaroidCap.textContent = fourcut.classList.contains('polaroid') ? (captionInput.value || ' ') : '';
}

btnStart.onclick = startCamera;
btnFlip.onclick = async ()=>{
  facing = (facing === 'user') ? 'environment' : 'user';
  await startCamera();
};
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
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  const w = Math.min(960, settings.width || 960);
  const h = Math.min(1280, settings.height || 1280);
  hiddenCanvas.width = w; hiddenCanvas.height = h;
  const ctx = hiddenCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = hiddenCanvas.toDataURL('image/jpeg', 0.75);
  shots.push(dataUrl);
  updateCounter();
  renderThumbs();
  if(shots.length===6){ btnShot.disabled = true; }
};

// frame pills
$$('.pill').forEach(p=>{
  p.onclick = ()=>{
    $$('.pill').forEach(x=>x.classList.remove('selected'));
    p.classList.add('selected');
    fourcut.classList.remove('classic','black','polaroid');
    fourcut.classList.add(p.dataset.frame);
    renderPreview();
    setStep(3);
  };
});

captionInput.addEventListener('input', ()=> renderPreview());

btnMake.onclick = async ()=>{
  if(selected.size!==4) return alert('4장을 선택하세요');
  if(!window.htmlToImage){ alert('스크립트 로드 지연: 새로고침 해주세요.'); return; }
  setStep(4);
  busyEl.hidden = false;
  try{
    // downscale for QR safety
    const dataUrl = await htmlToImage.toJpeg(fourcut, { quality: 0.75, canvasWidth: 720 });
    finalDataUrl = dataUrl;
    btnSave.disabled = false;
    btnQR.disabled = false;

    // save to operator gallery (IndexedDB/localStorage fallback)
    const id = crypto.randomUUID();
    await idbSet(`photo:${id}`, { id, createdAt: Date.now(), image: finalDataUrl });
  }catch(e){
    console.error('make fourcut error', e);
    alert('이미지 생성 실패: ' + (e?.message || e));
  }finally{
    busyEl.hidden = true;
  }
};

btnSave.onclick = ()=>{
  if(!finalDataUrl) return;
  const a = document.createElement('a');
  a.href = finalDataUrl; a.download = 'fourcut.jpg'; a.click();
};

// QR modal
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
    // compress into hash param
    const compressed = LZString.compressToEncodedURIComponent(finalDataUrl);

    // file://에서도 동작하도록 index.html 제거 후 붙이기
    const base = location.href.replace(/index\\.html(?:\\?.*)?(?:#.*)?$/,'');
    const viewerURL = base + 'viewer.html#img=' + compressed;

    lastQRLink = viewerURL;
    qrModal.hidden = false;
    await QRCode.toCanvas(qrCanvas, viewerURL, { width: 260, errorCorrectionLevel: 'M' });
    qrLinkText.textContent = viewerURL;
  }catch(e){
    console.error('QR generate error', e);
    alert('QR 생성 중 오류: ' + (e?.message || e));
  }
};

btnOpenViewer.onclick = ()=>{ if(lastQRLink) window.open(lastQRLink, '_blank'); };
btnSaveQR.onclick = ()=>{
  const dataUrl = qrCanvas.toDataURL('image/png');
  const a = document.createElement('a'); a.href = dataUrl; a.download = 'fourcut_qr.png'; a.click();
};
btnCopyLink.onclick = async ()=>{
  try{
    await navigator.clipboard.writeText(lastQRLink || '');
    btnCopyLink.textContent = '복사됨!';
    setTimeout(()=> btnCopyLink.textContent = '링크 복사', 1200);
  }catch{}
};
btnCloseQR.onclick = ()=>{ qrModal.hidden = true; };

// operator gallery
btnGallery.onclick = async ()=>{
  gallery.hidden = false; await renderGallery();
};
btnCloseGallery.onclick = ()=> gallery.hidden = true;

async function renderGallery(){
  const grid = $('#galleryGrid'); grid.innerHTML='';
  const keys = await idbKeys();
  const items = [];
  for(const k of keys){ if(String(k).startsWith('photo:')) items.push(await idbGet(k)); }
  items.sort((a,b)=>b.createdAt-a.createdAt);
  for(const it of items){
    const img = document.createElement('img');
    img.src = it.image; img.title = new Date(it.createdAt).toLocaleString();
    grid.appendChild(img);
  }
}

// init
updateCounter();
