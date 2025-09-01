// ====== 유틸 ======
const $ = (q, r=document)=>r.querySelector(q);

let stream=null;
let shots=[];
let selected=new Set();
let finalDataUrl=null;
let autoTimer=null;
let autoRunning=false;
let currentFacing = "user";
let remain = 6;

// ====== 카메라 ======
async function startCamera(){
  try{
    if(stream) stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode: currentFacing }, audio:false
    });
    const video=$("#video");
    video.srcObject=stream;
    video.onloadedmetadata=()=> video.play();

    if(currentFacing==="user") video.classList.add("mirror");
    else video.classList.remove("mirror");

    $("#btnShot").disabled=false;
  }catch(e){
    console.error("카메라 오류:", e.name, e.message);
    alert("카메라 접근 실패: "+e.message);
  }
}
function stopCamera(){ stream?.getTracks().forEach(t=>t.stop()); stream=null; }

// ====== 촬영 ======
function triggerFlash(){
  const f=$("#flash");
  f.classList.add("active");
  setTimeout(()=>f.classList.remove("active"),250);
}
function updateCountdownUI(text){ $("#countdown").textContent=text; }

async function startAutoCapture(){
  shots=[]; selected.clear(); finalDataUrl=null;
  renderThumbs(); renderPreview(); updateCounter();

  autoRunning=true;
  remain=6;
  if(autoTimer){ clearInterval(autoTimer); }
  updateCountdownUI(remain);

  autoTimer=setInterval(()=>{
    if(!autoRunning){
      clearInterval(autoTimer);
      updateCountdownUI("");
      return;
    }
    remain--;
    updateCountdownUI(remain>0 ? remain : "");
    if(remain<=0){
      triggerFlash();
      doCapture();
      remain=6;
      if(shots.length>=6){
        autoRunning=false;
        clearInterval(autoTimer);
        updateCountdownUI("");
      }
    }
  },1000);
}

function doCapture(){
  const video=$("#video");
  const canvas=document.createElement("canvas");
  canvas.width=video.videoWidth; 
  canvas.height=video.videoHeight;
  const ctx=canvas.getContext("2d");

  if(currentFacing==="user"){
    ctx.translate(canvas.width,0);
    ctx.scale(-1,1);
  }
  ctx.drawImage(video,0,0,canvas.width,canvas.height);

  const dataUrl=canvas.toDataURL("image/jpeg",0.9);
  if(shots.length<6){ 
    shots.push(dataUrl); 
    renderThumbs(); updateCounter(); 
  }
}

// ====== 썸네일/미리보기 ======
function renderThumbs(){
  const grid=$("#thumbGrid"); grid.innerHTML="";
  shots.forEach((src,idx)=>{
    const d=document.createElement("div");
    d.className="thumb"+(selected.has(idx)?" sel":"");
    const img=document.createElement("img"); img.src=src; d.appendChild(img);
    d.onclick=()=>{
      if(selected.has(idx)) selected.delete(idx);
      else if(selected.size<4) selected.add(idx);
      renderThumbs(); renderPreview();
      $("#btnMake").disabled=!(selected.size===4);
    };
    grid.appendChild(d);
  });
}
function updateCounter(){ $("#shotCounter").textContent=`${shots.length} / 6`; }
function renderPreview(){
  const grid=$("#finalGrid"); grid.innerHTML="";
  [...selected].forEach(i=>{
    const cell=document.createElement("div"); cell.className="cell";
    const img=document.createElement("img"); img.src=shots[i];
    cell.appendChild(img); grid.appendChild(cell);
  });
  $("#polaroidCap").textContent=$("#caption").value||" ";
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
  const payload={id,createdAt:Date.now(),image:finalDataUrl};
  localStorage.setItem("photo:"+id,JSON.stringify(payload));
  await renderGallery();
  await showQrPopupWithUpload(); // QR 팝업 띄우기
}
function resetSession(){
  shots=[]; selected.clear(); finalDataUrl=null;
  $("#caption").value="";
  renderThumbs(); renderPreview(); updateCounter();
  $("#btnSave").disabled=true;
  $("#btnMake").disabled=true;
}
async function renderGallery(){
  const grid=$("#galleryGrid"); grid.innerHTML="";
  const keys=Object.keys(localStorage).filter(k=>k.startsWith("photo:"));
  const items=keys.map(k=>JSON.parse(localStorage.getItem(k)));
  items.sort((a,b)=>b.createdAt-a.createdAt);
  if(items.length===0){
    grid.innerHTML="<div style='grid-column:1/-1;text-align:center;color:#999'>저장된 사진 없음</div>";
    return;
  }
  for(const it of items){
    const wrap=document.createElement("div"); wrap.className="g-item";
    const img=document.createElement("img"); img.src=it.image; wrap.appendChild(img);
    const del=document.createElement("button"); del.className="del"; del.textContent="×";
    del.onclick=()=>{ localStorage.removeItem("photo:"+it.id); renderGallery(); };
    wrap.appendChild(del); grid.appendChild(wrap);
  }
}

// ====== 프레임/글씨 색상 ======
function hexToRgb(hex){const m=hex.replace('#','');const bigint=parseInt(m,16);
  if(m.length===3){const r=(bigint>>8)&0xF,g=(bigint>>4)&0xF,b=bigint&0xF;return{r:r*17,g:g*17,b:b*17};}
  return {r:(bigint>>16)&255,g:(bigint>>8)&255,b:bigint&255};}
function rgbToHex({r,g,b}){const h=(n)=>n.toString(16).padStart(2,'0');return`#${h(r)}${h(g)}${h(b)}`;}
function mix(hex1,hex2,t){const a=hexToRgb(hex1),b=hexToRgb(hex2);return rgbToHex({r:Math.round(a.r+(b.r-a.r)*t),g:Math.round(a.g+(b.g-a.g)*t),b:Math.round(a.b+(b.b-a.b)*t)});}
function updateFrame(){
  const style=$("#frameStyle")?.value||"polaroid";
  const color=$("#frameColor")?.value||"#ffffff";
  const fourcut=$("#fourcut");
  if(style==="polaroid"){fourcut.className="fourcut polaroid";fourcut.style.background=color;}
  else if(style==="solid"){fourcut.className="fourcut solid";fourcut.style.background=color;}
  else if(style==="gradientLight"){fourcut.className="fourcut gradient";fourcut.style.background=`linear-gradient(135deg, ${color} 0%, ${mix(color,"#ffffff",0.7)} 100%)`;}
  else if(style==="gradientDark"){fourcut.className="fourcut gradient";fourcut.style.background=`linear-gradient(135deg, ${color} 0%, ${mix(color,"#000000",0.5)} 100%)`;}
}
function updateFontColor(){
  const c=$("#fontColor")?.value||"#000000";
  $(".fc-title").style.color=c;
  $("#polaroidCap").style.color=c;
}

// ====== Cloudinary 업로드 + QR 팝업 ======
const CLOUD_NAME    = 'djqkuxfki';        // 본인 Cloudinary 이름
const UPLOAD_PRESET = 'fourcut_unsigned'; // 본인 업로드 preset

async function uploadFinalToCloudinary(){
  if (!finalDataUrl) throw new Error('finalDataUrl이 없습니다.');
  const blob = await (await fetch(finalDataUrl)).blob();
  const form = new FormData();
  form.append('file', blob);
  form.append('upload_preset', UPLOAD_PRESET);
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  const res = await fetch(endpoint, { method:'POST', body: form });
  if (!res.ok) throw new Error('업로드 실패');
  const data = await res.json();
  return data.secure_url;
}
function makeViewerUrl(publicUrl){
  const u = new URL('viewer.html', location.href);
  u.searchParams.set('img', publicUrl);
  return u.toString();
}

// ====== QR 팝업 모달 ======
function computeQrPopupSize(){
  return Math.max(160, Math.floor(Math.min(window.innerWidth*0.6, 240)));
}
function openQrPopup(viewerUrl){
  const popup=document.getElementById('qrPopup');
  const wrap=document.getElementById('qrPopupContainer');
  wrap.innerHTML=""; // 기존 QR 제거
  new QRCode(wrap,{   // ✅ QR 코드 생성
    text:viewerUrl,
    width:computeQrPopupSize(),
    height:computeQrPopupSize(),
    correctLevel:QRCode.CorrectLevel.M
  });
  popup.style.display='flex'; // 모달 열기
}
function closeQrPopup(){
  resetSession();             // 닫으면 세션 초기화
  const el=document.getElementById('qrPopup');
  if(el) el.style.display='none';
}
async function showQrPopupWithUpload(){
  const publicUrl=await uploadFinalToCloudinary();
  const viewerUrl=makeViewerUrl(publicUrl);
  openQrPopup(viewerUrl);
}

// ====== 이벤트 바인딩 ======
document.addEventListener("DOMContentLoaded", ()=>{
  $("#frameStyle").oninput=updateFrame;
  $("#frameColor").oninput=updateFrame;
  $("#fontColor").oninput=updateFontColor;

  $("#btnStart").onclick=async()=>{ await startCamera(); startAutoCapture(); };
  $("#btnShot").onclick=()=>{ triggerFlash(); doCapture(); if(autoRunning){remain=6; updateCountdownUI(remain);} };
  $("#caption").oninput=()=>renderPreview();
  $("#btnMake").onclick=()=>makeFourcut();
  $("#btnSave").onclick=()=>saveImage();
  $("#btnGallery").onclick=async()=>{ const pass=prompt("갤러리를 열기 위한 암호를 입력하세요:"); if(pass==="posungprogramming"){ await renderGallery(); $("#gallery").hidden=false; $("#gallery").classList.add("open"); $("#backdrop").hidden=false; } else if(pass!==null){ alert("암호가 틀렸습니다."); }};
  $("#btnCloseGallery").onclick=()=>{ $("#gallery").classList.remove("open"); setTimeout(()=>$("#gallery").hidden=true,250); $("#backdrop").hidden=true; };
  $("#btnWipeGallery").onclick=()=>{ if(confirm("모두 삭제?")){ Object.keys(localStorage).filter(k=>k.startsWith("photo:")).forEach(k=>localStorage.removeItem(k)); renderGallery(); } };
  $("#backdrop").onclick=()=>{ $("#gallery").classList.remove("open"); setTimeout(()=>$("#gallery").hidden=true,250); $("#backdrop").hidden=true; };
  $("#btnReset").onclick=()=>{ resetSession(); };
  $("#btnFlip").onclick=async()=>{ currentFacing=(currentFacing==="user")?"environment":"user"; await startCamera(); };

  updateFrame(); updateFontColor();
});
