window.LAST_PHOTO_URL = '';

// 유틸
const $ = (q, r=document)=>r.querySelector(q);

// 상태
let stream=null;
let shots=[];
let selected=new Set();
let finalDataUrl=null;
let autoTimer=null;
let autoRunning=false;
let currentFacing = "user";
let remain = 6;

// 카메라 시작
async function startCamera(){
  try{
    if(stream) stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode: { exact: currentFacing } }, audio:false
    });
    const video=$("#video");
    video.srcObject=stream;
    video.onloadedmetadata=()=> video.play();

    if(currentFacing==="user") video.classList.add("mirror");
    else video.classList.remove("mirror");

    $("#btnShot").disabled=false;
  }catch(e){
    console.error(e);
    alert("카메라 접근 실패 (브라우저/권한 확인)");
  }
}
function stopCamera(){ stream?.getTracks().forEach(t=>t.stop()); stream=null; }

// 플래시
function triggerFlash(){
  const f=$("#flash");
  f.classList.add("active");
  setTimeout(()=>f.classList.remove("active"),250);
}

// 카운트다운 표시
function showCountdown(text){ $("#countdown").textContent=text; }

// 자동 촬영 (6초 루프, 총 6장)
async function startAutoCapture(){
  shots=[]; selected.clear(); finalDataUrl=null;
  renderThumbs(); renderPreview(); updateCounter();

  autoRunning=true;
  remain=6;

  if(autoTimer){ clearInterval(autoTimer); }
  showCountdown(remain);

  autoTimer=setInterval(()=>{
    if(!autoRunning){
      clearInterval(autoTimer);
      showCountdown("");
      return;
    }

    remain--;
    showCountdown(remain>0 ? remain : "");

    if(remain<=0){
      triggerFlash();
      doCapture();
      remain=6;

      if(shots.length>=6){
        autoRunning=false;
        clearInterval(autoTimer);
        showCountdown("");
      }
    }
  },1000);
}

// 사진 찍기
function doCapture(){
  const video=$("#video");
  const canvas=document.createElement("canvas");
  canvas.width=video.videoWidth; canvas.height=video.videoHeight;
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

// 썸네일
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

// 미리보기
function renderPreview(){
  const grid=$("#finalGrid"); grid.innerHTML="";
  [...selected].forEach(i=>{
    const cell=document.createElement("div"); cell.className="cell";
    const img=document.createElement("img"); img.src=shots[i];
    cell.appendChild(img); grid.appendChild(cell);
  });
  $("#polaroidCap").textContent=$("#caption").value||" ";
}

// 4컷 합성
async function makeFourcut(){
  if(selected.size!==4) return alert("4장을 선택하세요");
  const node=$("#fourcut");
  const canvas=await html2canvas(node,{backgroundColor:null,scale:2, useCORS:true});
  finalDataUrl=canvas.toDataURL("image/png");
  $("#btnSave").disabled=false;
}

// (옵션) 로컬 갤러리 저장
async function saveImageLocal(){
  if(!finalDataUrl) return;
  const id=Date.now();
  const payload={id,createdAt:Date.now(),image:finalDataUrl};
  localStorage.setItem("photo:"+id,JSON.stringify(payload));
  await renderGallery();
}

// 리셋
function resetSession(){
  shots=[];
  selected.clear();
  finalDataUrl=null;
  $("#caption").value="";
  renderThumbs();
  renderPreview();
  updateCounter();
  $("#btnSave").disabled=true;
  $("#btnMake").disabled=true;
}

// 갤러리
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

/* ------------------------
   프레임/글씨 색상 컨트롤
-------------------------*/
function hexToRgb(hex){
  const m = hex.replace('#','');
  const bigint = parseInt(m,16);
  if(m.length===3){
    const r=(bigint>>8)&0xF, g=(bigint>>4)&0xF, b=bigint&0xF;
    return {r:r*17, g:g*17, b:b*17};
  }
  return { r:(bigint>>16)&255, g:(bigint>>8)&255, b:bigint&255 };
}
function rgbToHex({r,g,b}){
  const h=(n)=>n.toString(16).padStart(2,'0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
function mix(hex1, hex2, t){
  const a=hexToRgb(hex1), b=hexToRgb(hex2);
  return rgbToHex({
    r: Math.round(a.r+(b.r-a.r)*t),
    g: Math.round(a.g+(b.g-a.g)*t),
    b: Math.round(a.b+(b.b-a.b)*t),
  });
}

// 프레임 적용
function updateFrame(){
  const style = $("#frameStyle")?.value || "polaroid";
  const color = $("#frameColor")?.value || "#ffffff";
  const fourcut = $("#fourcut");

  if(style==="polaroid"){
    fourcut.className = "fourcut polaroid";
    fourcut.style.background = color;
  }else if(style==="solid"){
    fourcut.className = "fourcut solid";
    fourcut.style.background = color;
  }else if(style==="gradientLight"){
    fourcut.className = "fourcut gradient";
    const to = "#ffffff";
    fourcut.style.background = `linear-gradient(135deg, ${color} 0%, ${mix(color,to,0.7)} 100%)`;
  }else if(style==="gradientDark"){
    fourcut.className = "fourcut gradient";
    const to = "#000000";
    fourcut.style.background = `linear-gradient(135deg, ${color} 0%, ${mix(color,to,0.5)} 100%)`;
  }
}

// 글씨색 적용
function updateFontColor(){
  const c = $("#fontColor")?.value || "#000000";
  $(".fc-title").style.color = c;
  $("#polaroidCap").style.color = c;
}

/* ------------------------
   이벤트 바인딩
-------------------------*/
$("#frameStyle").oninput = updateFrame;
$("#frameColor").oninput = updateFrame;
$("#fontColor").oninput = updateFontColor;

$("#btnStart").onclick=async()=>{ await startCamera(); startAutoCapture(); };

$("#btnShot").onclick=()=>{
  triggerFlash();
  doCapture();
  if(autoRunning){
    remain = 6;
    showCountdown(remain);
  }
};

$("#caption").oninput=()=>renderPreview();
$("#btnMake").onclick=()=>makeFourcut();

// ⛔ 기존: $("#btnSave").onclick=()=>saveImage();  (삭제)

// 갤러리 UI
$("#btnGallery").onclick=async()=>{ await renderGallery(); $("#gallery").hidden=false; $("#gallery").classList.add("open"); $("#backdrop").hidden=false; };
$("#btnCloseGallery").onclick=()=>{ $("#gallery").classList.remove("open"); setTimeout(()=>$("#gallery").hidden=true,250); $("#backdrop").hidden=true; };
$("#btnWipeGallery").onclick=()=>{ if(confirm("모두 삭제?")){ Object.keys(localStorage).filter(k=>k.startsWith("photo:")).forEach(k=>localStorage.removeItem(k)); renderGallery(); } };
$("#backdrop").onclick=()=>{ $("#gallery").classList.remove("open"); setTimeout(()=>$("#gallery").hidden=true,250); $("#backdrop").hidden=true; };

$("#btnReset").onclick=()=>{ shots=[];selected.clear();finalDataUrl=null;renderThumbs();renderPreview();updateCounter(); };

$("#btnFlip").onclick=async()=>{
  currentFacing = (currentFacing==="user") ? "environment" : "user";
  await startCamera();
};
await saveImageLocal();
// 초기 적용
updateFrame();
updateFontColor();

/* ========================
   저장 → 업로드(Catbox) → QR
   (Firebase 필요 없음)
======================== */
const saveBtn = document.getElementById('btnSave');
if (saveBtn) {
  saveBtn.onclick = async () => {
    try {
      // 1) 최종 이미지 dataURL 준비(이미 있으면 재사용)
      let dataUrl = finalDataUrl;
      if (!dataUrl) {
        const node = document.getElementById('fourcut');
        const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: null });
        dataUrl = canvas.toDataURL('image/png');
        finalDataUrl = dataUrl;
        $("#btnSave").disabled = false;
      }

      // 2) dataURL -> Blob
      const blob = await (await fetch(dataUrl)).blob();

      // 3) Catbox 업로드 (공개 URL 받기)
      const fd = new FormData();
      fd.append('reqtype', 'fileupload');
      fd.append('fileToUpload', blob, 'fourcut.png');

      const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: fd });
      const url = (await res.text()).trim();
      if (!/^https?:\/\//.test(url)) throw new Error(url);

      // 4) QR 표시
      window.LAST_PHOTO_URL = url;
      showQRForPhoto(url);

      // (옵션) 로컬 갤러리에도 저장하고 싶으면 주석 해제
      // await saveImageLocal();
      // resetSession();

    } catch (e) {
      console.error(e);
      alert('업로드/QR 오류: ' + (e?.message || e));
    }
  };
}

