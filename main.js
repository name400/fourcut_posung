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
const btnClearGallery = $('#btnClearGallery');
const busyEl = $('#busy');
const backdrop = document.getElementById('backdrop');

/* ===== storage (idb → localStorage fallback) ===== */
const useIDB = (window.idbKeyval && typeof window.idbKeyval.set === 'function');
const idb = useIDB ? {
  set: window.idbKeyval.set,
  get: window.idbKeyval.get,
  keys: window.idbKeyval.keys,
  del: window.idbKeyval.del
} : {
  set: (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} return Promise.resolve(); },
  get: async (k) => { try{ return JSON.parse(localStorage.getItem(k)); }catch{ return null; } },
  keys: async () => Object.keys(localStorage).filter(k => k.startsWith('photo:')),
  del: async (k) => { try{ localStorage.removeItem(k); }catch{} }
};
const { set: idbSet, get: idbGet, keys: idbKeys, del: idbDel } = idb;

/* ===== state ===== */
let stream = null;
let shots = [];            // captured dataURLs (max 6)
let selected = new Set();  // indexes for 4
let finalDataUrl = null;
let lastQRLink = null;
let facing = 'user';       // 'user' | 'environment'

/* ===== UI utils ===== */
function setStep(n){ [...$$('.step')].forEach((el,i)=> el.classList.toggle('active', i===n-1)); }
function updateCounter(){ shotCounter.textContent = `${shots.length} / 6`; setStep(shots.length === 6 ? 2 : 1); }
function hideBusyHard(){
  if(!busyEl) return;
  busyEl.hidden = true;
  busyEl.style.display = 'none';
  requestAnimationFrame(()=> busyEl.style.display = '');
}
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
  polaroidCap.textContent = fourcut.classList.contains('polaroid') ? (captionInput.value || ' ') : '';
}

/* ===== camera ===== */
async function startCamera(){
  try{
    if (stream) stopCamera();
    const constraints = { video: { facingMode: { ideal: facing }, width:{ideal:1280}, height:{ideal:720} }, audio:false };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream; btnShot.disabled = false;
  }catch(e){
    console.error('getUserMedia error', e);
    let msg = '카메라 접근 실패';
    if (e.name==='NotAllowedError' || e.name==='SecurityError'){
      msg = [
        '카메라 권한이 차단되어 있어요.',
        '1) 인앱 브라우저 말고 Chrome/Safari로 열기',
        '2) 자물쇠 아이콘 → 사이트 설정 → 카메라 허용',
        '3) 시크릿/비공개 모드 OFF',
        '4) OS 앱 권한에서 브라우저 카메라 허용'
      ].join('\n');
    }else if(e.name==='NotFoundError' || e.name==='OverconstrainedError'){
      msg = '카메라를 찾지 못했어요. 전면/후면 전환 또는 다른 브라우저/기기에서 시도해 주세요.';
    }else if(!window.isSecureContext){
      msg = 'HTTPS(또는 localhost)가 아니면 카메라 사용이 불가합니다.';
    }else{
      msg = `${msg}: ${e.name} ${e.message||''}`;
    }
    alert(msg);
  }
}
function stopCamera(){ try{ stream?.getTracks()?.forEach(t=>t.stop()); }catch{} stream=null; }

/* ===== events ===== */
btnStart.onclick = startCamera;
btnFlip.onclick = async ()=>{ facing = (facing==='user') ? 'environment' : 'user'; await startCamera(); };
btnReset.onclick = ()=>{
  shots=[]; selected=new Set(); finalDataUrl=null; lastQRLink=null;
  btnMake.disabled = btnSave.disabled = btnQR.disabled = true;
  renderThumbs(); renderPreview(); updateCounter(); hideBusyHard();
};
btnShot.onclick = ()=>{
  if(!stream || shots.length>=6) return;
  const track = stream.getVideoTracks()[0], s = track.getSettings();
  const w = Math.min(960, s.width||960), h = Math.min(1280, s.height||1280);
  hiddenCanvas.width = w; hiddenCanvas.height = h;
  hiddenCanvas.getContext('2d').drawImage(video,0,0,w,h);
  shots.push(hiddenCanvas.toDataURL('image/jpeg',0.75));
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
  setStep(4); busyEl.hidden=false;

  try{
    if(document.fonts && document.fonts.ready){
      try{ await Promise.race([document.fonts.ready, new Promise((_,rej)=>setTimeout(()=>rej(new Error('fonts timeout')),3000))]); }catch{}
    }
    const r = fourcut.getBoundingClientRect(), w=Math.round(r.width), h=Math.round(r.height);
    const filter = (node)=> !(node.id==='busy' || node.classList?.contains('busy'));
    const opts = { quality:0.85, width:w, height:h, canvasWidth:w, canvasHeight:h, pixelRatio:1, cacheBust:true, filter };

    const dataUrl = await htmlToImage.toJpeg(fourcut, opts);
    finalDataUrl = dataUrl;
    hideBusyHard();
    btnSave.disabled=false; btnQR.disabled=false;

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
  const a=document.createElement('a'); a.href=finalDataUrl; a.download='fourcut.jpg'; a.click();
};

/* ===== QR modal ===== */
const qrModal = $('#qrModal');
const qrCanvas = $('#qrCanvas');
const btnOpenViewer = $('#btnOpenViewer');
const btnSaveQR = $('#btnSaveQR');
const btnCloseQR = $('#btnCloseQR');
const btnCopyLink = $('#btnCopyLink');
const qrLinkText = $('#qrLinkText');

btnQR.onclick = async ()=>{
  hideBusyHard();
  if(!finalDataUrl) return;
  try{
    const compressed = LZString.compressToEncodedURIComponent(finalDataUrl);
    const viewerURL = new URL('viewer.html', location.href).toString() + '#img=' + compressed;
    lastQRLink = viewerURL;
    qrModal.hidden=false;
    await QRCode.toCanvas(qrCanvas, viewerURL, { width:260, errorCorrectionLevel:'M' });
    qrLinkText.textContent = viewerURL;
  }catch(e){
    console.error('QR error', e);
    alert('QR 생성 중 오류: ' + (e?.message||e));
    qrModal.hidden=false;
  }
};
btnOpenViewer.onclick = ()=>{ if(lastQRLink) window.open(lastQRLink,'_blank'); };
btnSaveQR.onclick = ()=>{
  const a=document.createElement('a'); a.href=qrCanvas.toDataURL('image/png'); a.download='fourcut_qr.png'; a.click();
};
btnCopyLink.onclick = async ()=>{
  try{ await navigator.clipboard.writeText(lastQRLink || ''); btnCopyLink.textContent='복사됨!'; setTimeout(()=>btnCopyLink.textContent='링크 복사',1200); }catch{}
};
btnCloseQR.onclick = ()=>{ qrModal.hidden = true; };

/* ===== gallery drawer (open/close/clear/delete) ===== */
function closeGallerySmooth(){
  gallery.classList.remove('open');
  setTimeout(()=>{ gallery.hidden=true; backdrop.hidden=true; }, 250);
}
btnGallery.onclick = async ()=>{
  await renderGallery();
  gallery.hidden=false; gallery.offsetHeight; gallery.classList.add('open');
  backdrop.hidden=false;
};
btnCloseGallery.onclick = closeGallerySmooth;
backdrop.onclick = closeGallerySmooth;
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && !gallery.hidden) closeGallerySmooth(); });

btnClearGallery.onclick = async ()=>{
  if(!confirm('갤러리의 모든 이미지를 삭제할까요? (이 기기에서만 삭제)')) return;
  const keys = await idbKeys();
  for(const k of keys){ if(String(k).startsWith('photo:')) await idbDel(k); }
  await renderGallery();
};

/* swipe to close */
let startX=null;
gallery.addEventListener('touchstart',(e)=>{ startX=e.touches[0].clientX; },{passive:true});
gallery.addEventListener('touchmove',(e)=>{
  if(startX===null) return;
  const dx=e.touches[0].clientX-startX, shift=Math.max(0,Math.min(dx,120));
  gallery.style.transform=`translateX(${shift}px)`;
},{passive:true});
gallery.addEventListener('touchend',(e)=>{
  if(startX===null) return;
  const dx=e.changedTouches[0].clientX-startX; startX=null;
  if(dx>60){ gallery.style.transform=''; closeGallerySmooth(); }
  else { gallery.style.transform=''; gallery.classList.add('open'); }
});

/* render gallery (with per-item delete) */
async function renderGallery(){
  const grid = $('#galleryGrid'); grid.innerHTML='';
  const keys = await idbKeys();
  const items=[];
  for(const k of keys){ if(String(k).startsWith('photo:')) items.push(await idbGet(k)); }
  items.sort((a,b)=>b.createdAt-a.createdAt);

  for(const it of items){
    const wrap = document.createElement('div');
    wrap.className = 'drawer-item';
    const img = document.createElement('img');
    img.src = it.image;
    img.title = new Date(it.createdAt).toLocaleString();
    const del = document.createElement('button');
    del.className='del-btn';
    del.textContent='삭제';
    del.onclick = async ()=>{
      await idbDel(`photo:${it.id}`);
      wrap.remove();
    };
    wrap.appendChild(img); wrap.appendChild(del);
    grid.appendChild(wrap);
  }
}

/* init */
updateCounter();
