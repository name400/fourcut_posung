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
const btnClearGallery = $('#btnClearGallery');
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

/* ====== 캡처 (수정된 부분) ====== */
btnShot.onclick = ()=>{
  if(!stream) return;
  if(shots.length >= 6) return;

  const track = stream.getVideoTracks()[0];
  const s = track.getSettings();

  // 기기 해상도/비율을 그대로 사용
  const w = video.videoWidth || s.width || 960;
  const h = video.videoHeight || s.height || 720;

  hiddenCanvas.width = w;
  hiddenCanvas.height = h;

  const ctx = hiddenCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);

  const dataUrl = hiddenCanvas.toDataURL('image/jpeg', 0.85);
  shots.push(dataUrl);

  updateCounter();
  renderThumbs();
  if(shots.length===6) btnShot.disabled = true;
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

/* ====== make final image ====== */
btnMake.onclick = async ()=>{
  if(selected.size!==4) return alert('4장을 선택하세요');
  if(!window.htmlToImage){
    alert('이미지 생성 모듈이 로드되지 않았습니다. 네트워크를 확인하고 새로고침 해주세요.');
    return;
  }

  setStep(4);
  busyEl.hidden = false;

  try{
    if (document.fonts && document.fonts.ready) {
      try { await Promise.race([document.fonts.ready, new Promise((_,rej)=>setTimeout(()=>rej(new Error('fonts timeout')), 3000))]); } catch(_) {}
    }

    const rect = fourcut.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    const filter = (node) => {
      return !(node.id === 'busy' || node.classList?.contains('busy'));
    };

    const options = {
      quality: 0.85,
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: 1,
      cacheBust: true,
      imagePlaceholder: '',
      filter
    };

    const dataUrl = await htmlToImage.toJpeg(fourcut, options);
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
btnClearGallery.onclick = async ()=>{
  if(!confirm('갤러리를 모두 삭제할까요?')) return;
  const keys = await idbKeys();
  for(const k of keys){ if(String(k).startsWith('photo:')) localStorage.removeItem(k); }
  await renderGallery();
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

    // 삭제 버튼 추가
    const del = document.createElement('button');
    del.className = 'del';
    del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="M18.3 5.71L12 12l6.3 6.29-1.42 1.42L12 13.41l-6.29 6.3-1.42-1.42L10.59 12 4.29 5.71 5.71 4.29 12 10.59l6.29-6.3z"/></svg>';
    del.onclick = async ()=>{
      if(!confirm('이 이미지를 삭제할까요?')) return;
      localStorage.removeItem(`photo:${it.id}`);
      await renderGallery();
    };

    wrap.appendChild(img);
    wrap.appendChild(del);
    grid.appendChild(wrap);
  }
}

/* ====== init ====== */
updateCounter();
