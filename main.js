const $=(q)=>document.querySelector(q);
const $$=(q)=>document.querySelectorAll(q);

const video=$('#video'), btnStart=$('#btnStart'), btnShot=$('#btnShot'),
      btnFlip=$('#btnFlip'), btnReset=$('#btnReset'), shotCounter=$('#shotCounter'),
      thumbGrid=$('#thumbGrid'), btnMake=$('#btnMake'), btnSave=$('#btnSave'), btnQR=$('#btnQR'),
      fourcut=$('#fourcut'), finalGrid=$('#finalGrid'), captionInput=$('#caption'),
      polaroidCap=$('#polaroidCap'), hiddenCanvas=$('#hiddenCanvas'),
      btnGallery=$('#btnGallery'), gallery=$('#gallery'), btnCloseGallery=$('#btnCloseGallery'),
      btnWipeGallery=$('#btnWipeGallery'), busyEl=$('#busy'), backdrop=$('#backdrop'),
      qrModal=$('#qrModal'), qrCanvas=$('#qrCanvas'), qrImg=$('#qrImg'),
      btnOpenViewer=$('#btnOpenViewer'), btnSaveQR=$('#btnSaveQR'),
      btnCloseQR=$('#btnCloseQR'), btnCopyLink=$('#btnCopyLink'), qrLinkText=$('#qrLinkText');

const { set:idbSet, get:idbGet, keys:idbKeys, del:idbDel } = window.idbKeyval;

let stream=null, shots=[], selected=new Set(), finalDataUrl=null, lastQRLink=null, facing='user';

function setStep(n){ [...$$('.step')].forEach((el,i)=> el.classList.toggle('active', i===n-1)); }
function updateCounter(){ shotCounter.textContent = `${shots.length} / 6`; setStep(shots.length===6?2:1); }

function renderThumbs(){
  thumbGrid.innerHTML='';
  shots.forEach((src, idx)=>{
    const d=document.createElement('div');
    d.className = 'thumb' + (selected.has(idx)?' sel':'');
    d.onclick=()=>{
      if(selected.has(idx)) selected.delete(idx);
      else if(selected.size<4) selected.add(idx);
      renderThumbs(); renderPreview();
      btnMake.disabled = !(selected.size===4);
      if(selected.size===4) setStep(3);
    };
    const img=document.createElement('img'); img.src=src; d.appendChild(img);
    thumbGrid.appendChild(d);
  });
}
function renderPreview(){
  finalGrid.innerHTML='';
  [...selected].slice(0,4).forEach(i=>{
    const cell=document.createElement('div'); cell.className='cell';
    const img=document.createElement('img'); img.src=shots[i]; cell.appendChild(img);
    finalGrid.appendChild(cell);
  });
  polaroidCap.textContent = fourcut.classList.contains('polaroid') ? (captionInput.value||' ') : '';
}

// camera
async function startCamera(){
  try{
    if(stream) stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:facing } });
    video.srcObject = stream; btnShot.disabled=false;
  }catch(e){ alert('카메라 접근 실패: '+e.message); }
}
function stopCamera(){ try{ stream?.getTracks()?.forEach(t=>t.stop()); }catch{} stream=null; }

btnStart.onclick=startCamera;
btnFlip.onclick=async()=>{ facing=(facing==='user')?'environment':'user'; await startCamera(); };
btnReset.onclick=()=>{ shots=[]; selected=new Set(); finalDataUrl=null; lastQRLink=null;
  btnMake.disabled=true; btnSave.disabled=true; btnQR.disabled=true;
  renderThumbs(); renderPreview(); updateCounter(); busyEl.hidden=true; };
btnShot.onclick=()=>{
  if(!stream || shots.length>=6) return;
  const track=stream.getVideoTracks()[0];
  const s=track.getSettings();
  const w=Math.min(960,s.width||960), h=Math.min(1280,s.height||1280);
  hiddenCanvas.width=w; hiddenCanvas.height=h;
  hiddenCanvas.getContext('2d').drawImage(video,0,0,w,h);
  shots.push(hiddenCanvas.toDataURL('image/jpeg',0.75));
  updateCounter(); renderThumbs();
  if(shots.length===6) btnShot.disabled=true;
};

$$('.pill').forEach(p=>{ p.onclick=()=>{ $$('.pill').forEach(x=>x.classList.remove('selected'));
  p.classList.add('selected'); fourcut.classList.remove('classic','black','polaroid');
  fourcut.classList.add(p.dataset.frame); renderPreview(); setStep(3); }; });
captionInput.addEventListener('input', renderPreview);

btnMake.onclick=async()=>{
  if(selected.size!==4) return alert('4장을 선택하세요');
  if(!window.htmlToImage){ alert('이미지 생성 모듈 로드 실패'); return; }
  busyEl.hidden=false;
  try{
    const r=fourcut.getBoundingClientRect();
    const dataUrl=await htmlToImage.toJpeg(fourcut,{quality:0.85,width:r.width,height:r.height});
    finalDataUrl=dataUrl; btnSave.disabled=false; btnQR.disabled=false;
    const id=crypto.randomUUID(); await idbSet(`photo:${id}`,{id,createdAt:Date.now(),image:finalDataUrl});
  }catch(e){ alert('이미지 생성 실패: '+e.message); }
  finally{ busyEl.hidden=true; }
};
btnSave.onclick=()=>{ if(finalDataUrl){ const a=document.createElement('a'); a.href=finalDataUrl; a.download='fourcut.jpg'; a.click(); } };

// QR
async function renderQR(url){
  qrLinkText.textContent=url; qrModal.hidden=false;
  if(window.QRCode){ try{ await QRCode.toCanvas(qrCanvas,url,{width:260}); return; }catch{} }
  qrImg.src='https://api.qrserver.com/v1/create-qr-code/?size=260x260&data='+encodeURIComponent(url);
  qrImg.hidden=false;
}
btnQR.onclick=async()=>{ if(!finalDataUrl) return;
  const compressed=LZString.compressToEncodedURIComponent(finalDataUrl);
  const viewerURL=new URL('viewer.html',location.href).toString()+'#img='+compressed;
  lastQRLink=viewerURL; await renderQR(viewerURL); };
btnOpenViewer.onclick=()=>{ if(lastQRLink) window.open(lastQRLink,'_blank'); };
btnSaveQR.onclick=()=>{ const a=document.createElement('a'); a.href=qrCanvas.toDataURL('image/png'); a.download='fourcut_qr.png'; a.click(); };
btnCopyLink.onclick=async()=>{ try{await navigator.clipboard.writeText(lastQRLink||''); btnCopyLink.textContent='복사됨!'; setTimeout(()=>btnCopyLink.textContent='링크 복사',1200);}catch{} };
btnCloseQR.onclick=()=>{ qrModal.hidden=true; };

// gallery
function openGallery(){ gallery.hidden=false; backdrop.hidden=false; }
function closeGallery(){ gallery.hidden=true; backdrop.hidden=true; }
btnGallery.onclick=async()=>{ await renderGallery(); openGallery(); };
btnCloseGallery.onclick=closeGallery;
backdrop.onclick=closeGallery;

async function renderGallery(){
  const grid=$('#galleryGrid'); grid.innerHTML='';
  const keys=await idbKeys(); const items=[];
  for(const k of keys){ if(String(k).startsWith('photo:')) items.push(await idbGet(k)); }
  items.sort((a,b)=>b.createdAt-a.createdAt);
  for(const it of items){
    const wrap=document.createElement('div'); wrap.className='g-item';
    const img=document.createElement('img'); img.src=it.image; img.title=new Date(it.createdAt).toLocaleString();
    const del=document.createElement('button'); del.className='del';
    del.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="M18.3 5.71 12 12l6.3 6.29-1.42 1.42L12 13.41l-6.29 6.3-1.42-1.42L10.59 12 4.29 5.71 5.71 4.29 12 10.59l6.29-6.3z"/></svg>';
    del.onclick=async(e)=>{ e.stopPropagation(); if(!confirm('이 사진을 삭제할까요?')) return;
      await idbDel(`photo:${it.id}`); wrap.remove(); };
    wrap.append(img,del); grid.appendChild(wrap);
  }
}
btnWipeGallery.onclick=async()=>{ if(!confirm('전체 삭제?')) return;
  const keys=await idbKeys(); for(const k of keys){ if(String(k).startsWith('photo:')) await idbDel(k); }
  await renderGallery(); };

updateCounter();};
$$('.pill').forEach(p=>{
  p.onclick=()=>{
    $$('.pill').forEach(x=>x.classList.remove('selected')); p.classList.add('selected');
    fourcut.classList.remove('classic','black','polaroid'); fourcut.classList.add(p.dataset.frame);
    renderPreview(); setStep(3);
  };
});
captionInput.addEventListener('input', renderPreview);

// ===== make image =====
btnMake.onclick = async ()=>{
  if(selected.size!==4) return alert('4장을 선택하세요');
  if(!window.htmlToImage){ alert('이미지 생성 모듈 로드 실패. 새로고침 해주세요.'); return; }
  busyEl.hidden=false;
  try{
    // 폰트 로딩 대기 (최대 3초)
    if(document.fonts && document.fonts.ready){
      try{ await Promise.race([document.fonts.ready, new Promise((_,rej)=>setTimeout(()=>rej(),3000))]); }catch{}
    }
    const r = fourcut.getBoundingClientRect();
    const width=Math.round(r.width), height=Math.round(r.height);
    const dataUrl = await htmlToImage.toJpeg(fourcut,{
      quality:0.85, width, height, canvasWidth:width, canvasHeight:height, pixelRatio:1, cacheBust:true,
      filter:(node)=>!(node.id==='busy' || node.classList?.contains('busy'))
    });
    finalDataUrl = dataUrl;
    btnSave.disabled=false; btnQR.disabled=false;
    const id = crypto.randomUUID();
    await idbSet(`photo:${id}`, { id, createdAt:Date.now(), image:finalDataUrl });
  }catch(e){
    console.error(e); alert('이미지 생성 실패: ' + (e?.message || e));
  }finally{
    busyEl.hidden=true;
  }
};
btnSave.onclick=()=>{
  if(!finalDataUrl) return;
  const a=document.createElement('a'); a.href=finalDataUrl; a.download='fourcut.jpg'; a.click();
};

// ===== QR =====
async function renderQR(url){
  qrLinkText.textContent = url;
  qrModal.hidden = false;
  if(window.QRCode && qrCanvas && qrCanvas.getContext){
    try{
      qrImg.hidden=true;
      await QRCode.toCanvas(qrCanvas, url, { width:260, errorCorrectionLevel:'M' });
      return;
    }catch(e){ console.warn('QRCode.toCanvas 실패, 폴백 사용', e); }
  }
  // 폴백 이미지 서비스
  qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent(url);
  qrImg.hidden = false;
  if(qrCanvas){ qrCanvas.width=0; qrCanvas.height=0; }
}
btnQR.onclick=async()=>{
  if(!finalDataUrl) return;
  const compressed = LZString.compressToEncodedURIComponent(finalDataUrl);
  const viewerURL = new URL('viewer.html', location.href).toString() + '#img=' + compressed;
  lastQRLink = viewerURL;
  await renderQR(viewerURL);
};
btnOpenViewer.onclick=()=>{ if(lastQRLink) window.open(lastQRLink, '_blank'); };
btnSaveQR.onclick=()=>{
  if(!qrImg.hidden && qrImg.src){
    window.open(qrImg.src, '_blank', 'noopener,noreferrer');
  }else if(qrCanvas && qrCanvas.width){
    const a=document.createElement('a'); a.href=qrCanvas.toDataURL('image/png'); a.download='fourcut_qr.png'; a.click();
  }
};
btnCopyLink.onclick=async()=>{ try{
  await navigator.clipboard.writeText(lastQRLink || '');
  btnCopyLink.textContent='복사됨!'; setTimeout(()=>btnCopyLink.textContent='링크 복사',1200);
}catch{} };
btnCloseQR.onclick=()=>{ qrModal.hidden=true; };

// ===== gallery =====
function openGallery(){ gallery.hidden=false; backdrop.hidden=false; }
function closeGallery(){ gallery.hidden=true; backdrop.hidden=true; }
btnGallery.onclick=async()=>{ await renderGallery(); openGallery(); };
btnCloseGallery.onclick=closeGallery;
backdrop.onclick=closeGallery;
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && !gallery.hidden) closeGallery(); });

async function renderGallery(){
  const grid=$('#galleryGrid'); grid.innerHTML='';
  const keys=await idbKeys(); const items=[];
  for(const k of keys){ if(String(k).startsWith('photo:')) items.push(await idbGet(k)); }
  items.sort((a,b)=> b.createdAt - a.createdAt);
  for(const it of items){
    const wrap=document.createElement('div'); wrap.className='g-item';
    const img=document.createElement('img'); img.src=it.image; img.title=new Date(it.createdAt).toLocaleString();
    const del=document.createElement('button'); del.className='del'; del.setAttribute('aria-label','삭제'); del.textContent='✕';
    del.onclick=async(e)=>{ e.stopPropagation(); if(!confirm('이 사진을 삭제할까요?')) return; await idbDel(`photo:${it.id}`); wrap.remove(); };
    wrap.append(img, del); grid.appendChild(wrap);
  }
}
btnWipeGallery.onclick=async()=>{
  if(!confirm('갤러리의 모든 항목을 삭제할까요?')) return;
  const keys=await idbKeys(); for(const k of keys){ if(String(k).startsWith('photo:')) await idbDel(k); }
  await renderGallery();
  alert('삭제 완료');
};

// ===== init =====
updateCounter();

