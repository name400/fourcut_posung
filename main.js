// 유틸
const $ = (q, r=document)=>r.querySelector(q);

// 상태
let stream=null;
let shots=[];
let selected=new Set();
let finalDataUrl=null;
let autoTimer=null;
let autoRunning=false;   // 자동 촬영 중 여부
let currentFacing = "user"; // 기본 전면 카메라

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

    // 전면 카메라는 거울모드
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
  let remain=6;

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
      remain=6; // 다시 6초 초기화

      // 6컷 다 채우면 종료
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

  if(currentFacing==="user"){ // 전면 카메라 좌우반전
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
  const canvas=await html2canvas(node,{backgroundColor:null,scale:2});
  finalDataUrl=canvas.toDataURL("image/jpeg",0.92);
  $("#btnSave").disabled=false;
  $("#btnDownload").disabled=false;
}

// 저장
async function saveImage(){
  if(!finalDataUrl) return;
  const id=Date.now();
  const payload={id,createdAt:Date.now(),image:finalDataUrl};
  localStorage.setItem("photo:"+id,JSON.stringify(payload));
  await renderGallery();
  alert("저장 완료!");
}

// 다운로드
$("#btnDownload").onclick=()=>{
  if(!finalDataUrl) return;
  const a=document.createElement("a");
  a.href=finalDataUrl;
  a.download="fourcut.jpg";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

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

// 프레임 색상 변경
$("#frameColor").oninput=()=>{ $(".fourcut").style.backgroundColor=$("#frameColor").value; };

// 버튼 이벤트
$("#btnStart").onclick=async()=>{ await startCamera(); startAutoCapture(); };

// 수동 촬영 (자동촬영 중지 + 카운트다운 초기화)
$("#btnShot").onclick=()=>{ 
  if(autoTimer){ clearInterval(autoTimer); autoTimer=null; }
  autoRunning=false;
  showCountdown("");
  triggerFlash();
  doCapture(); 
};

$("#caption").oninput=()=>renderPreview();
$("#btnMake").onclick=()=>makeFourcut();
$("#btnSave").onclick=()=>saveImage();

$("#btnGallery").onclick=async()=>{ await renderGallery(); $("#gallery").hidden=false; $("#gallery").classList.add("open"); $("#backdrop").hidden=false; };
$("#btnCloseGallery").onclick=()=>{ $("#gallery").classList.remove("open"); setTimeout(()=>$("#gallery").hidden=true,250); $("#backdrop").hidden=true; };
$("#btnWipeGallery").onclick=()=>{ if(confirm("모두 삭제?")){ Object.keys(localStorage).filter(k=>k.startsWith("photo:")).forEach(k=>localStorage.removeItem(k)); renderGallery(); } };
$("#backdrop").onclick=()=>{ $("#gallery").classList.remove("open"); setTimeout(()=>$("#gallery").hidden=true,250); $("#backdrop").hidden=true; };

$("#btnReset").onclick=()=>{ shots=[];selected.clear();finalDataUrl=null;renderThumbs();renderPreview();updateCounter(); };

// 카메라 전환
$("#btnFlip").onclick=async()=>{
  currentFacing = (currentFacing==="user") ? "environment" : "user";
  await startCamera();
};
