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

// dataURL 재압축
async function recompressDataURL(dataUrl, quality=0.8){
  const img = await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=dataUrl; });
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  canvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);
  return canvas.toDataURL('image/jpeg', quality);
}

// unique id (충돌 방지 강화)
const genId = ()=>{
  const t = Date.now().toString(36);
  const p = (performance?.now ? Math.floor(performance.now()*1000).toString(36) : '');
  const r = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return (crypto?.randomUUID?.() || `id_${t}_${p}_${r}`);
};

// toast
function toast(msg){
  let t = document.getElementById('toast');
  if(!t){
    t = document.createElement('div');
    t.id='toast';
    Object.assign(t.style,{
      position:'fixed',left:'50%',bottom:'24px',transform:'translateX(-50%)',
      background:'#111a',color:'#fff',padding:'10px 14px',borderRadius:'10px',
      zIndex:99999,backdropFilter:'blur(2px)',fontWeight:'600',transition:'opacity .2s'
    });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = 1;
  clearTimeout(t._tid);
  t._tid = setTimeout(()=>{ t.style.opacity=0; }, 1800);
}

/* ===== config ===== */
const MIRROR_FRONT = true;
const AUTO_LIMIT_SEC = 6;
const EXPORT_BASE_W = 1200;
const DPR_CAP = 2;
const PHOTO_PREFIX = 'photo:';
const LS_EVICT_BATCH = 2;
const RECOMP_QUALITIES = [0.92, 0.85, 0.75, 0.65];

/* ===== state ===== */
let stream = null;
let shots = [];
let selected = new Set();
let finalDataUrl = null;
let lastQRLink = null;
let facing = 'user';
let renderLock = false;
let autoTimer = null;
let autoRemain = 0;
let flashEl = null;
let bigCountdownEl = null;

/* ===== storage: IDB 우선 → LS 폴백 ===== */
const idb = window.idbKeyval || {};
const ls = {
  set: (k, v)=>{ localStorage.setItem(k, JSON.stringify(v)); },
  get: (k)=>{ const s=localStorage.getItem(k); return s?JSON.parse(s):null; },
  del: (k)=>{ localStorage.removeItem(k); },
  keys: ()=> Object.keys(localStorage),
};

async function dbAllKeys(){
  let a=[], b=[];
  if (idb.keys) { try { a = await idb.keys(); } catch(e){ console.warn('[IDB keys fail]', e); } }
  try { b = ls.keys(); } catch(e){ console.warn('[LS keys fail]', e); }
  const set = new Set([...(a||[]).map(String), ...(b||[]).map(String)]);
  return [...set].filter(k => k.startsWith(PHOTO_PREFIX));
}
async function listOldestFirst(){
  const keys = await dbAllKeys();
  const items = [];
  for(const k of keys){
    try{ const v = await dbGetImage(k); if (v) items.push({key:k, createdAt: v.createdAt||0}); }
    catch(e){ console.warn('[get fail]', e); }
  }
  items.sort((a,b)=> a.createdAt - b.createdAt);
  return items.map(x=>x.key);
}
async function dbSetImage(k, payload){
  if (idb.set) { try { await idb.set(k, payload); return {ok:true}; } catch(e){ console.warn('[IDB set fail]', e); } }
  try { ls.set(k, payload); return {ok:true}; } catch(e){ console.warn('[LS set fail]', e); return {ok:false}; }
}
async function dbGetImage(k){
  if (idb.get) { try { const v = await idb.get(k); if (v!=null) return v; } catch(e){ } }
  try { return ls.get(k); } catch(e){ return null; }
}
async function dbDelImage(k){
  if (idb.del) { try { await idb.del(k); } catch(e){} }
  try { ls.del(k); } catch(e){}
}

/* ===== UI helpers ===== */
function setStep(n){ [...$$('.step')].forEach((el,i)=> el.classList.toggle('active', i===n-1)); }
function updateCounter(){ const el=$('#shotCounter'); if(el) el.textContent = `${shots.length} / 6`; setStep(shots.length===6?2:1); }
function renderThumbs(){
  const grid=$('#thumbGrid'); if(!grid) return;
  grid.innerHTML = '';
  shots.forEach((src, idx)=>{
    const d = document.createElement('div');
    d.className = 'thumb' + (selected.has(idx) ? ' sel' : '');
    d.onclick = ()=>{
      if(selected.has(idx)) selected.delete(idx);
      else if(selected.size < 4) selected.add(idx);
      renderThumbs(); renderPreview();
      $('#btnMake').disabled = !(selected.size===4);
      if(selected.size===4) setStep(3);
    };
    const img = document.createElement('img'); img.src = src; d.appendChild(img);
    grid.appendChild(d);
  });
}
function renderPreview(){
  const grid=$('#finalGrid'); if(!grid) return;
  grid.innerHTML = '';
  [...selected].slice(0,4).forEach(i=>{
    const cell = document.createElement('div'); cell.className = 'cell';
    const img = document.createElement('img'); img.src = shots[i];
    cell.appendChild(img); grid.appendChild(cell);
  });
  $('#polaroidCap').textContent = $('#caption')?.value || ' ';
}

/* flash & countdown */
function ensureFlash(){ if(flashEl) return flashEl; flashEl=document.createElement('div'); flashEl.className='flash'; document.body.appendChild(flashEl); return flashEl; }
function triggerFlash(){ const el=ensureFlash(); el.classList.add('active'); setTimeout(()=>el.classList.remove('active'),280); }
function ensureBigCountdown(){ if(bigCountdownEl) return bigCountdownEl; bigCountdownEl=document.createElement('div'); bigCountdownEl.className='big-countdown'; document.body.appendChild(bigCountdownEl); return bigCountdownEl; }
function showBigCountdown(sec){ ensureBigCountdown().textContent = sec>0?sec:''; }

/* ===== camera ===== */
async function startCamera(){
  try{
    if (stream) stopCamera();
    const constraints = { video: { facingMode:{ideal:facing}, width:{ideal:1280}, height:{ideal:720} }, audio:false };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video=$('#video');
    if (video) {
      video.srcObject = stream;
      video.classList.toggle('mirror', MIRROR_FRONT && (facing==='user'));
    }
    await new Promise(res=>{ video.onloadedmetadata = res; });
    $('#btnShot').disabled = false;
    resetAndStartAutoTimer();
  }catch(e){
    console.error('[camera]', e);
    alert('카메라 접근 실패: 권한/HTTPS 확인');
  }
}
function stopCamera(){ try{ stream?.getTracks()?.forEach(t=>t.stop()); }catch{} stream=null; stopAutoTimer(); }

on($('#btnStart'),'click', startCamera);
on($('#btnFlip'),'click', async ()=>{ facing=(facing==='user')?'environment':'user'; await startCamera(); });
on($('#btnReset'),'click', ()=>{
  shots=[]; selected=new Set(); finalDataUrl=null; lastQRLink=null;
  $('#btnMake').disabled = true;
  $('#btnSave').disabled = true;
  $('#btnQR').disabled = true;
  $('#btnShot').disabled = !stream;
  renderThumbs(); renderPreview(); updateCounter(); resetAndStartAutoTimer();
});
on($('#caption'),'input', renderPreview);
on($('#btnShot'),'click', ()=>{ stopAutoTimer(); doCapture(); });

/* ===== auto timer ===== */
function startAutoTimerTick(){
  stopAutoTimer();
  autoRemain = AUTO_LIMIT_SEC;
  showBigCountdown(autoRemain);
  autoTimer = setInterval(()=>{
    autoRemain -= 1;
    if (autoRemain>0){ showBigCountdown(autoRemain); }
    else { stopAutoTimer(); showBigCountdown(''); doCapture(); }
  },1000);
}
function resetAndStartAutoTimer(){ stopAutoTimer(); startAutoTimerTick(); }
function stopAutoTimer(){ if(autoTimer){ clearInterval(autoTimer); autoTimer=null; } }
/* ===== 이미지 합성 (캔버스 기반) ===== */
async function composeFourcutCanvas(){
  const node = $('#fourcut');
  const rect = node.getBoundingClientRect();
  const width = EXPORT_BASE_W;
  const height = Math.round(width * rect.height / rect.width);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio||1, DPR_CAP);
  canvas.width = width*dpr; canvas.height = height*dpr;
  ctx.scale(dpr,dpr);

  // 배경
  ctx.fillStyle = getComputedStyle(node).backgroundColor || '#fff';
  ctx.fillRect(0,0,width,height);

  // 렌더링 대상만 캡쳐
  await html2canvas(node, {
    canvas,
    width,
    height,
    backgroundColor:null,
    scale:dpr
  });
  return canvas.toDataURL('image/jpeg',0.92);
}

/* ===== 이미지 만들기 & 저장 ===== */
on($('#btnMake'),'click', async ()=>{
  if(selected.size!==4) return alert('4장을 선택하세요');
  if(renderLock) return;
  renderLock = true; setStep(4);

  try{
    finalDataUrl = await composeFourcutCanvas();
    const id = genId();
    const key = `photo:${id}`;
    let ok = false;

    // 1) Blob(IDB)
    try{
      const blob = dataURLtoBlob(finalDataUrl);
      const payload = {id, createdAt: Date.now(), image: blob, type:'blob'};
      const r = await dbSetImage(key, payload);
      if(r.ok){ ok = true; toast('저장 완료 (IDB)'); }
    }catch(e){ console.warn('[blob save fail]', e); }

    // 2) LS 폴백
    if(!ok){
      let dataForLS = finalDataUrl;
      let saved=false;
      for(const q of RECOMP_QUALITIES){
        if(q<1.0) dataForLS = await recompressDataURL(finalDataUrl,q);
        const payload = {id, createdAt: Date.now(), image: dataForLS, type:'dataurl'};
        const r = await dbSetImage(key, payload);
        if(r.ok){ saved=true; toast('저장 완료 (LS)'); break; }
        // 오래된 항목 제거 후 재시도
        const victims = (await listOldestFirst()).slice(0,LS_EVICT_BATCH);
        for(const vk of victims) await dbDelImage(vk);
      }
      if(!saved) toast('저장 실패: 저장소 용량 제한');
    }

    $('#btnSave').disabled=false;

    // ✅ 저장 후 바로 갤러리 갱신
    await renderGallery();

    // ✅ 상태 초기화 → 다시 새 4컷 만들 수 있게
    shots=[]; selected=new Set(); finalDataUrl=null;
    $('#btnMake').disabled=true;
    $('#btnQR').disabled=true;
    renderThumbs(); renderPreview(); updateCounter();

  }catch(e){
    console.error('[make]', e);
    alert('이미지 생성/저장 실패');
  }finally{
    renderLock=false;
  }
});

/* ===== 갤러리 ===== */
async function renderGallery(){
  const grid = $('#galleryGrid'); if(!grid) return;
  grid.innerHTML='';

  let keys=[];
  try{ keys = await dbAllKeys(); }catch(e){}
  const items=[];
  for(const k of keys){
    try{
      const v = await dbGetImage(k);
      if(v) items.push(v);
    }catch(e){}
  }
  items.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  if(items.length===0){
    const empty=document.createElement('div');
    empty.style.cssText='grid-column:1/-1;color:#999;text-align:center;padding:16px;';
    empty.textContent='갤러리에 저장된 이미지가 없습니다.';
    grid.appendChild(empty);
    return;
  }

  for(const it of items){
    const wrap=document.createElement('div'); wrap.className='g-item';
    const img=document.createElement('img');
    if(it.type==='blob' && it.image instanceof Blob){
      const url=URL.createObjectURL(it.image);
      img.src=url;
      img.onload=img.onerror=()=>URL.revokeObjectURL(url);
    }else{
      img.src=it.image;
    }
    img.alt='saved'; img.title=new Date(it.createdAt).toLocaleString();
    img.style.cursor='zoom-in';
    img.onclick=()=> window.open(img.src,'_blank');

    const del=document.createElement('button'); del.className='del'; del.innerHTML='×';
    del.onclick=async()=>{ if(!confirm('이 이미지를 삭제할까요?')) return;
      await dbDelImage(`photo:${it.id}`); await renderGallery(); };

    wrap.appendChild(img); wrap.appendChild(del); grid.appendChild(wrap);
  }
}

/* ===== 갤러리 drawer 이벤트 ===== */
function closeGallerySmooth(){ gallery.classList.remove('open'); setTimeout(()=>{ gallery.hidden=true; backdrop.hidden=true; },250); }
on($('#btnGallery'),'click', async ()=>{ await renderGallery(); gallery.hidden=false; gallery.offsetHeight; gallery.classList.add('open'); backdrop.hidden=false; });
on($('#btnCloseGallery'),'click', closeGallerySmooth);
on(backdrop,'click', closeGallerySmooth);
on($('#btnWipeGallery'),'click', async ()=>{ if(!confirm('모두 삭제?')) return;
  const keys=await dbAllKeys(); for(const k of keys) await dbDelImage(k); await renderGallery(); toast('삭제 완료');
});

}); // DOMContentLoaded
