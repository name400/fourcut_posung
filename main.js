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
const busyEl = $('#busy');
const backdrop = document.getElementById('backdrop');

/* ====== storage (idb → localStorage fallback) ====== */
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
    img.src = shots[i]; // dataURL (same-origin)
    cell.appendChild(img);
    finalGrid.appendChild(cell);
  });
  polaroidCap.textContent = fourcut.classList.contains('polaroid') ? (captionInput.value || ' ') : '';
}

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
    btnShot.disabled = false;
  }catch(e){
    console.error('getUserMedia error', e);
    let msg = '카메라 접근 실패';
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
      msg = [
        '카메라 권한이 차단되어 있어요.',
        '1) 인앱 브라우저 말고 Chrome/Safari로 열기',
        '2) 주소창 자물쇠 → 사이트 설정 → 카메라 허용',
        '3) 시크릿/비공개 모드 OFF',
        '4) OS 앱 권한에서 해당 브라우저의 카메라 허용'
      ].join('\n');
    } else if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') {
      msg = '사용 가능한 카메라를 찾지 못했어요. 카메라 전환 버튼을 눌러보거나 다른 브라우저/기기를 사용해 보세요.';
    } else if (!window.isSecureContext) {
      msg = 'HTTPS(또는 localhost)가 아니면 카메라를 쓸 수 없어요. GitHub Pages/HTTPS에서 접속해 주세요.';
    } else {
      msg = `${msg}: ${e.name} ${e.message || ''}`;
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
  const track = stream.getVideoTracks()[0];
  const s = track.getSettings();
  const w = Math.min(960, s.width || 960);
  const h = Math.min(1280, s.height || 1280);
  hiddenCanvas.width = w; hiddenCanvas.height = h;
  const ctx = hiddenCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = hiddenCanvas.toDataURL('image/jpeg', 0.75);
  shots.push(dataUrl);
  updateCounter();
  renderThumbs();
  if(shots.length===6){ btnShot.disabled = true; }
};

/* frame pills */
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

/* ====== make final image (fixed) ====== */
btnMake.onclick = async ()=>{
  if(selected.size!==4) return alert('4장을 선택하세요');
  if(!window.htmlToImage){
    alert('이미지 생성 모듈이 로드되지 않았습니다. 네트워크를 확인하고 새로고침 해주세요.');
    return;
  }

  setStep(4);
  busyEl.hidden = false;

  try{
    // 1) 웹폰트가 있다면 모두 로드될 때까지 대기 (무한대기 방지)
    if (document.fonts && document.fonts.ready) {
      try { await Promise.race([document.fonts.ready, new Promise((_,rej)=>setTimeout(()=>rej(new Error('fonts timeout')), 3000))]); } catch(_) {}
    }

    // 2) 렌더 타겟의 정확한 박스 크기를 고정 (레이아웃 변동 방지)
    const rect = fourcut.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    // 3) busy 오버레이는 캡처 제외 (렌더 중 화면만 가리고 결과물에는 안 보이도록)
    const filter = (node) => {
      return !(node.id === 'busy' || node.classList?.contains('busy'));
    };

    const options = {
      quality: 0.85,
      width,
      height,
      canvasWidth: width,  // 내부 스케일 고정
      canvasHeight: height,
      pixelRatio: 1,       // 과도한 해상도 방지 (QR 길이 줄이기에도 도움)
      cacheBust: true,
      imagePlaceholder: '', // 실패 시 빈칸으로
      filter
    };

    const dataUrl = await htmlToImage.toJpeg(fourcut, options);
    finalDataUrl = dataUrl;

    btnSave.disabled = false;
    btnQR.disabled = false;

    // 4) 로컬 갤러리에 저장
    const id = crypto.randomUUID();
    await idbSet(`photo:${id}`, { id, createdAt: Date.now(), image: finalDataUrl });
  }catch(e){
    console.error('make fourcut error', e);
    alert('이미지 생성 실패: ' + (e?.message || e));
  }finally{
    busyEl.hidden = true; // 항상 닫기
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
    // GitHub Pages 서브경로 / 로컬 / 파일스킴 모두 안전
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
btnOpenViewer.onclick = ()=>{ if(lastQRLink) window.open(lastQRLink, '_blank'); };
btnSaveQR.onclick = ()=>{
  const dataUrl = qrCanvas.toDataURL('image/png');
  const a = document.createElement('a'); a.href = dataUrl; a.download = 'fourcut_qr.png'; a.click();
};
btnCopyLink.onclick = async ()=>{
  try{
    await navigator.clipboard.writeText(lastQRLink || '');
    btnCopyLink.textContent = '복사됨!'; setTimeout(()=> btnCopyLink.textContent = '링크 복사', 1200);
  }catch{}
};
btnCloseQR.onclick = ()=>{ qrModal.hidden = true; };

/* ====== gallery drawer (백드롭/스와이프) ====== */
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
  gallery.offsetHeight;     // force reflow
  gallery.classList.add('open');
  backdrop.hidden = false;
};
btnCloseGallery.onclick = closeGallerySmooth;
backdrop.onclick = closeGallerySmooth;
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && !gallery.hidden) closeGallerySmooth(); });

let startX = null;
gallery.addEventListener('touchstart', (e)=>{ startX = e.touches[0].clientX; }, {passive:true});
gallery.addEventListener('touchmove', (e)=>{
  if(startX===null) return;
  const dx = e.touches[0].clientX - startX;
  const shift = Math.max(0, Math.min(dx, 120));
  gallery.style.transform = `translateX(${shift}px)`;
}, {passive:true});
gallery.addEventListener('touchend', (e)=>{
  if(startX===null) return;
  const endX = e.changedTouches[0].clientX;
  const dx = endX - startX;
  startX = null;
  if(dx > 60){ gallery.style.transform = ''; closeGallerySmooth(); }
  else{ gallery.style.transform = ''; gallery.classList.add('open'); }
});

/* ====== render gallery ====== */
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

/* ====== init ====== */
updateCounter();
