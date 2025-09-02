const $ = (q, r=document)=>r.querySelector(q);

let stream=null, shots=[], selected=new Set();
let finalDataUrl=null, autoTimer=null, autoRunning=false;
let remain = 6, currentFacing="user", currentDeviceId=null;

// ====== 카메라 ======
async function listCameras(){
  const devices=await navigator.mediaDevices.enumerateDevices();
  const select=$("#cameraSelect"); select.innerHTML="";
  devices.filter(d=>d.kind==="videoinput").forEach(d=>{
    const opt=document.createElement("option");
    opt.value=d.deviceId; opt.textContent=d.label||`카메라 ${select.length+1}`;
    select.appendChild(opt);
  });
  if(!currentDeviceId && select.options.length>0){
    currentDeviceId=select.options[0].value;
  }
  select.value=currentDeviceId;
}
async function startCamera(){
  try{
    if(stream) stopCamera();
    const constraints=currentDeviceId
      ? { video:{ deviceId:{exact:currentDeviceId} }, audio:false }
      : { video:{ facingMode: currentFacing }, audio:false };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video=$("#video");
    video.srcObject=stream;
    video.onloadedmetadata=()=>video.play();
    $("#btnShot").disabled=false;
  }catch(e){ alert("카메라 접근 실패: "+e.message); }
}
function stopCamera(){ stream?.getTracks().forEach(t=>t.stop()); stream=null; }

// ====== 촬영 ======
function triggerFlash(){ const f=$("#flash"); f.classList.add("active"); setTimeout(()=>f.classList.remove("active"),250); }
function updateCountdownUI(t){ $("#countdown").textContent=t; }

async function startAutoCapture(){
  shots=[]; selected.clear(); finalDataUrl=null;
  renderThumbs(); renderPreview(); updateCounter();
  autoRunning=true; remain=6;
  if(autoTimer) clearInterval(autoTimer);
  updateCountdownUI(remain);
  autoTimer=setInterval(()=>{
    if(!autoRunning){ clearInterval(autoTimer); updateCountdownUI(""); return; }
    remain--; updateCountdownUI(remain>0?remain:"");
    if(remain<=0){ triggerFlash(); doCapture(); remain=6;
      if(shots.length>=6){ autoRunning=false; clearInterval(autoTimer); updateCountdownUI(""); } }
  },1000);
}
function doCapture(){
  const video=$("#video"), canvas=document.createElement("canvas");
  canvas.width=video.videoWidth; canvas.height=video.videoHeight;
  const ctx=canvas.getContext("2d");
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  const dataUrl=canvas.toDataURL("image/jpeg",0.9);
  if(shots.length<6){ shots.push(dataUrl); renderThumbs(); updateCounter(); }
}

// ====== 썸네일/미리보기 ======
function renderThumbs(){
  const grid=$("#thumbGrid"); grid.innerHTML="";
  shots.forEach((src,idx)=>{
    const d=document.createElement("div");
    d.className="thumb"+(selected.has(idx)?" sel":"");
    d.innerHTML=`<img src="${src}">`;
    d.onclick=()=>{ selected.has(idx)?selected.delete(idx):selected.size<4&&selected.add(idx);
      renderThumbs(); renderPreview(); $("#btnMake").disabled=!(selected.size===4); };
    grid.appendChild(d);
  });
}
function updateCounter(){ $("#shotCounter").textContent=`${shots.length} / 6`; }
function renderPreview(){
  const grid=$("#finalGrid"); grid.innerHTML="";
  [...selected].forEach(i=>{
    const cell=document.createElement("div"); cell.className="cell";
    cell.innerHTML=`<img src="${shots[i]}">`; grid.appendChild(cell);
  });
}

// ====== 합성 ======
async function makeFourcut(){
  if(selected.size!==4) return alert("4장을 선택하세요");
  const node=$("#fourcut");
  const canvas=await html2canvas(node,{backgroundColor:null,scale:2});
  finalDataUrl=canvas.toDataURL("image/jpeg",0.92);
  $("#btnSave").disabled=false;
}

// ====== 저장 & 갤러리 ======
async function saveImage(){
  if(!finalDataUrl) return;
  const id=Date.now();
  localStorage.setItem("photo:"+id,JSON.stringify({id,createdAt:Date.now(),image:finalDataUrl}));
  await renderGallery(); await showQrPopupWithUpload();
}
function resetSession(){ shots=[];selected.clear();finalDataUrl=null; renderThumbs();renderPreview();updateCounter(); $("#btnSave").disabled=true;$("#btnMake").disabled=true; }
async function renderGallery(){
  const grid=$("#galleryGrid"); grid.innerHTML="";
  const items=Object.keys(localStorage).filter(k=>k.startsWith("photo:")).map(k=>JSON.parse(localStorage.getItem(k))).sort((a,b)=>b.createdAt-a.createdAt);
  if(!items.length){ grid.innerHTML="<div style='grid-column:1/-1;text-align:center;color:#999'>저장된 사진 없음</div>"; return; }
  for(const it of items){
    const wrap=document.createElement("div"); wrap.className="g-item";
    wrap.innerHTML=`<img src="${it.image}"><button class="del">×</button>`;
    wrap.querySelector(".del").onclick=()=>{ localStorage.removeItem("photo:"+it.id); renderGallery(); };
    grid.appendChild(wrap);
  }
}

// ====== 프레임/글씨 색상 ======
function hexToRgb(hex){const m=hex.replace('#','');const b=parseInt(m,16);if(m.length===3){const r=(b>>8)&0xF,g=(b>>4)&0xF,l=b&0xF;return{r:r*17,g:g*17,b:l*17};}return{r:(b>>16)&255,g:(b>>8)&255,b:b&255};}
function rgbToHex({r,g,b}){const h=n=>n.toString(16).padStart(2,'0');return`#${h(r)}${h(g)}${h(b)}`;}
function mix(a,b,t){a=hexToRgb(a);b=hexToRgb(b);return rgbToHex({r:Math.round(a.r+(b.r-a.r)*t),g:Math.round(a.g+(b.g-a.g)*t),b:Math.round(a.b+(b.b-a.b)*t)});}
function updateFrame(){ const s=$("#frameStyle").value,c=$("#frameColor").value,f=$("#fourcut"); if(s==="polaroid"){f.className="fourcut polaroid";f.style.background=c;} else if(s==="solid"){f.className="fourcut solid";f.style.background=c;} else if(s==="gradientLight"){f.className="fourcut gradient";f.style.background=`linear-gradient(135deg, ${c} 0%, ${mix(c,"#fff",0.7)} 100%)`;} else{f.className="fourcut gradient";f.style.background=`linear-gradient(135deg, ${c} 0%, ${mix(c,"#000",0.5)} 100%)`;} }
function updateFontColor(){ const c=$("#fontColor").value; $(".fc-title").style.color=c; }

// ====== Cloudinary 업로드 + QR ======
const CLOUD_NAME='djqkuxfki', UPLOAD_PRESET='fourcut_unsigned';
async function uploadFinalToCloudinary(){ const blob=await(await fetch(finalDataUrl)).blob(); const form=new FormData(); form.append('file',blob); form.append('upload_preset',UPLOAD_PRESET); const res=await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,{method:'POST',body:form}); const data=await res.json(); return data.secure_url; }
function makeViewerUrl(u){ const v=new URL('viewer.html',location.href); v.searchParams.set('img',u); return v.toString(); }
function computeQrPopupSize(){ return Math.max(160,Math.floor(Math.min(window.innerWidth*0.6,240))); }
function openQrPopup(url) {
  // ✅ finalDataUrl이 없으면 새로고침 시 팝업 차단
  if (!finalDataUrl) return;

  const p = $("#qrPopup"), w = $("#qrPopupContainer");
  w.innerHTML = "";
  new QRCode(w, {
    text: url,
    width: computeQrPopupSize(),
    height: computeQrPopupSize(),
    correctLevel: QRCode.CorrectLevel.M
  });
  p.style.display = 'flex';
}
function closeQrPopup(){ resetSession(); $("#qrPopup").style.display='none'; }
async function showQrPopupWithUpload() { 
  if (!finalDataUrl) return;
  
  const u=await uploadFinalToCloudinary(); 
  openQrPopup(makeViewerUrl(u));
  
}

// ====== 이벤트 ======
document.addEventListener("DOMContentLoaded", async ()=>{
  await listCameras();
  $("#cameraSelect").onchange=()=>{ currentDeviceId=$("#cameraSelect").value; };
  $("#frameStyle").oninput=updateFrame; $("#frameColor").oninput=updateFrame; $("#fontColor").oninput=updateFontColor;
  $("#btnStart").onclick=async()=>{ await startCamera(); startAutoCapture(); };
  $("#btnShot").onclick=()=>{ triggerFlash(); doCapture(); if(autoRunning){remain=6;updateCountdownUI(remain);} };
  $("#btnMake").onclick=()=>makeFourcut(); $("#btnSave").onclick=()=>saveImage();
  $("#btnGallery").onclick=async()=>{ const pass=prompt("갤러리 암호 입력:"); if(pass==="posungprogramming"){ await renderGallery(); $("#gallery").hidden=false; $("#gallery").classList.add("open"); $("#backdrop").hidden=false; } else if(pass!==null) alert("암호가 틀렸습니다."); };
  $("#btnCloseGallery").onclick=()=>{ $("#gallery").classList.remove("open"); setTimeout(()=>$("#gallery").hidden=true,250); $("#backdrop").hidden=true; };
  $("#btnWipeGallery").onclick=()=>{ if(confirm("모두 삭제?")){ Object.keys(localStorage).filter(k=>k.startsWith("photo:")).forEach(k=>localStorage.removeItem(k)); renderGallery(); } };
  $("#backdrop").onclick=()=>{ $("#gallery").classList.remove("open"); setTimeout(()=>$("#gallery").hidden=true,250); $("#backdrop").hidden=true; };
  $("#btnReset").onclick=()=>resetSession();
  $("#btnFlip").onclick=async()=>{ currentFacing=(currentFacing==="user")?"environment":"user"; currentDeviceId=null; await startCamera(); };
  updateFrame(); updateFontColor();
});


