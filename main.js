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

/* ===== storage (idb → localStorage fallback) ===== */
const idb = (window.idbKeyval && typeof window.idbKeyval.set === 'function') ? {
  set: window.idbKeyval.set,
  get: window.idbKeyval.get,
  keys: window.idbKeyval.keys,
  del: window.idbKeyval.del
} : {
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(_) {} return Promise.resolve(); },
  get: async (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch(_) { return null; } },
  keys: async () => Object.keys(localStorage),
  del: async (k) => { try { localStorage.removeItem(k); } catch(_) {} }
};
const { set: idbSet, get: idbGet, keys: idbKeys, del: idbDel } = idb;

/* ===== state ===== */
let stream = null;
let shots = [];
let selected = new Set();
let finalDataUrl = null;
let lastQRLink = null;
let facing = 'user';

/* ===== utils ===== */
function setStep(n){ [...$$('.step')].forEach((el,i)=> el.classList.toggle('active', i===n-1)); }
function updateCounter(){ shotCounter.textContent = `${shots.length} / 6`; setStep(shots.length === 6 ? 2 : 1); }
function hideBusyHard(){ if(!busyEl) return; busyEl.hidden = true; busyEl.style.display='none'; requestAnimationFrame(()=>busyEl.style.display=''); }

/* ===== thumbs / preview ===== */
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
    const cell = document.createElement('div');
    cell.className = 'cell';
    const img = document.createElement('img'); img.src = shots[i];
    cell.appendChild(img); finalGrid.appendChild(cell);
  });
  polaroidCap.textContent = fourcut.classList.contains('polaroid') ? (captionInput.value || ' ') : '';
}

/* ===== camera ===== */
async function startCamera(){
  try{
    if (stream) stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
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
        '4) OS 앱 권한에서 브라우저의 카메라 허용'
      ].join('\n');
    } else if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') {
      msg = '카메라를 찾지 못했어요. 전/후면 전환 또는 다른 브라우저를 사용해 보세요.';
    } else if (!window.isSecureContext) {
      msg = 'HTTPS(또는 localhost)가 아니면 카메라 사용 불가';
    } else { msg = `${e.name} ${e.message || ''}`; }
    alert(msg);
  }
}
function stopCamera(){ try{ stream?.getTracks()?.forEach(t=>t.stop()); }catch{} stream = null; }

/* ===== events ===== */
btnStart.onclick = startCamera;
btnFlip.onclick = async ()=>{ facing = (facing === 'user') ? 'environment' : 'user'; await startCamera(); };
btnReset.onclick = ()=>{
  shots = []; selected = new Set(); finalDataUrl = null; lastQRLink = null;
  btnMake.disabled = true; btnSave.disabled = true; btnQR.disabled = true;
  renderThumbs(); renderPreview(); updateCounter(); hideBusyHard();
};
btnShot.onclick = ()=>{
  if(!stream || shots.length >= 6) return;
  const track = stream.getVideoTracks()[0];
  const s = track.getSettings();
  const w = Math.min(960, s.width || 960);
  const h = Math.min(1280, s.height || 1280);
  hiddenCanvas.width = w; hiddenCanvas.height = h;
  hiddenCanvas.getContext('2d').drawImage(video, 0, 0, w, h);
  shots.push(hiddenCanvas.toDataURL('image/jpeg', 0.75));
  updateCounter(); renderThumbs();
  if(shots.length===6) btnShot.disabled = true;
};
$$('.pill').forEach(p=>{
  p.onclick = ()=>{
    $$('.pill').forEach(x=>x.classList.remove('selected'));
    p.classList.add('selected');
    fourcut.classList.remove('classic','black','polaroid');
    fourcut.classList.add(p.dataset.frame);
    renderPreview(); setStep(3);
  };
});
captionInput.addEventListener('input', ()=> renderPreview());

/* ===== make final image ===== */
btnMake.onclick = async ()=>{
  if(selected.size!==4) return alert('4장을 선택하세요');
  if(!window.htmlToImage){ alert('이미지 생성 모듈 로드 실패. 새로고침 해주세요.'); return; }

  setStep(4);
  busyEl.hidden = false;

  try{
    if (document.fonts && document.fonts.ready) {
      try { await Promise.race([document.fonts.ready, new Promise((_,rej)=>setTimeout(()=>rej(),3000))]); } catch {}
    }
    const r = fourcut.getBoundingClientRect();
    const width = Math.round(r.width), height = Math.round(r.height);
    const dataUrl = await htmlToImage.toJpeg(fourcut, {
      quality: 0.85, width, height, canvasWidth: width, canvasHeight: height,
      pixelRatio: 1, cacheBust: true,
      filter: (node)=>!(node.id==='busy' || node.classList?.contains('busy'))
    });
    finalDataUrl = dataUrl;
    hideBusyHard();
    btnSave.disabled = false; btnQR.disabled = false;

    const id = crypto.randomUUID();
    await idbSet(`photo:${id}`, { id, createdAt: Date.now(), image: finalDataUrl });
  }catch(e){
    console.error('make fourcut error', e);
    alert('이미지 생성 실패: ' + (e?.message || e));
  }finally{
    hideBusyHard();
  }
};

/* save */
btnSave.onclick = ()=>{
  hideBusyHard();
  if(!finalDataUrl) return;
  const a = document.createElement('a');
  a.href = finalDataUrl; a.download = 'fourcut.jpg'; a.click();
};

/* ===== QR modal (라이브러리 없으면 이미지 폴백) ===== */
const qrModal = $('#qrModal');
const qrCanvas = $('#qrCanvas');
const qrImg = $('#qrImg');
const btnOpenViewer = $('#btnOpenViewer');
const btnSaveQR = $('#btnSaveQR');
const btnCloseQR = $('#btnCloseQR');
const btnCopyLink = $('#btnCopyLink');
const qrLinkText = $('#qrLinkText');

async function renderQR(url){
  qrLinkText.textContent = url;
  qrModal.hidden = false;

  if (window.QRCode && qrCanvas && qrCanvas.getContext) {
    try{
      qrImg.hidden = true;
      await QRCode.toCanvas(qrCanvas, url, { width: 260, errorCorrectionLevel: 'M' });
      return;
    }catch(e){ console.warn('QRCode.toCanvas 실패, 이미지 폴백 사용', e); }
  }
  const api = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent(url);
  qrImg.src = api; qrImg.hidden = false;
  if (qrCanvas) { qrCanvas.width = 0; qrCanvas.height = 0; }
}

btnQR.onclick = async ()=>{
  hideBusyHard();
  if(!finalDataUrl) return;
  try{
    const compressed = LZString.compressToEncodedURIComponent(finalDataUrl);
    const viewerURL = new URL('viewer.html', location.href).toString() + '#img=' + compressed;
    lastQRLink = viewerURL;
    await renderQR(viewerURL);
  }catch(e){
    console.error('QR generate error', e);
    alert('QR 생성 중 오류: ' + (e?.message || e));
  }
};
btnOpenViewer.onclick = ()=>{ if(lastQRLink) window.open(lastQRLink, '_blank'); };
btnSaveQR.onclick = ()=>{
  if (!qrImg.hidden && qrImg.src) {
    window.open(qrImg.src, '_blank', 'noopener,noreferrer');
  } else if (qrCanvas && qrCanvas.width) {
    const dataUrl = qrCanvas.toDataURL('image/png');
    const a = document.createElement('a'); a.href = dataUrl; a.download = 'fourcut_qr.png'; a.click();
  }
};
btnCopyLink.onclick = async ()=>{ try{
  await navigator.clipboard.writeText(lastQRLink || '');
  btnCopyLink.textContent = '복사됨!'; setTimeout(()=> btnCopyLink.textContent = '링크 복사', 1200);
} catch{} };
btnCloseQR.onclick = ()=>{ qrModal.hidden = true; };

/* ===== Gallery ===== */
function closeGallery(){ gallery.hidden = true; backdrop.hidden = true; }
btnGallery.onclick = async ()=>{ await renderGallery(); gallery.hidden = false; backdrop.hidden = false; };
btnCloseGallery.onclick = closeGallery;
backdrop.onclick = closeGallery;
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && !gallery.hidden) closeGallery(); });

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
    img.src = it.image;
    img.title = new Date(it.createdAt).toLocaleString();

    // 🔴 빨간 X 삭제 버튼
    const del = document.createElement('button');
    del.className = 'del';
    del.setAttribute('aria-label','삭제');
    del.textContent = '✕';
    del.onclick = async (e)=>{
      e.stopPropagation();
      if(!confirm('이 사진을 삭제할까요?')) return;
      await idbDel(`photo:${it.id}`);
      wrap.remove();
    };

    wrap.append(img, del);
    grid.appendChild(wrap);
  }
}

btnWipeGallery.onclick = async ()=>{
  if(!confirm('갤러리의 모든 항목을 삭제할까요?')) return;
  const keys = await idbKeys();
  for(const k of keys){ if(String(k).startsWith('photo:')) await idbDel(k); }
  await renderGallery();
  alert('삭제 완료');
};

/* init */
updateCounter();
