// 유틸
const $ = (q, r=document)=>r.querySelector(q);

// 상태
let stream=null;
let shots=[];
let selected=new Set();
let finalDataUrl=null;
let autoTimer=null;
let autoRemain=0;
let shotCount=0;

// 카메라 시작
async function startCamera(){
  try{
    if(stream) stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    const video=$("#video");
    video.srcObject=stream;
    video.onloadedmetadata=()=> video.play();
    $("#btnShot").disabled=false;
  }catch(e){ alert("카메라 접근 실패"); }
}
function stopCamera(){ stream?.getTracks().forEach(t=>t.stop()); stream=null; }

// 플래시
function triggerFlash(){
  const f=$("#flash");
  f.classList.add("active");
  setTimeout(()=>f.classList.remove("active"),250);
}

// 카운트다운 표시
function showCountdown(text){
  $("#countdown").textContent=text;
}

// 자동 촬영 (6장)
// 자동 촬영 (6장 연속)
async function startAutoCapture(){
  shots=[]; selected.clear(); finalDataUrl=null;
  renderThumbs(); renderPreview(); updateCounter();

  let count=0; // 찍은 장 수

  function oneCycle(sec=6){
    let remain=sec;
    showCountdown(remain);

    autoTimer=setInterval(()=>{
      remain--;
      showCountdown(remain>0 ? remain : "");
      if(remain<=0){
        clearInterval(autoTimer);
        triggerFlash();
        doCapture();
        count++;
        if(count<6){ // 아직 6장 안 됐으면 다음 주기 시작
          setTimeout(()=>oneCycle(sec),1000);
        }
      }
    },1000);
  }

  oneCycle(); // 첫 주기 시작
}


// 사진 찍기
function doCapture(){
  const video=$("#video");
  const canvas=document.createElement("canvas");
  canvas.width=video.videoWidth; canvas.height=video.videoHeight;
  canvas.getContext("2d").drawImage(video,0,0);
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
  $("#btnSave").disabled=true; // 합성 후 저장 가능
  $("#btnSave").disabled=false;
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
$("#btnShot").onclick=()=>{ triggerFlash(); doCapture(); };
$("#caption").oninput=()=>renderPreview();
$("#btnMake").onclick=()=>makeFourcut();
$("#btnSave").onclick=()=>saveImage();

$("#btnGallery").onclick=async()=>{ await renderGallery(); $("#gallery").hidden=false; $("#gallery").classList.add("open"); $("#backdrop").hidden=false; };
$("#btnCloseGallery").onclick=()=>{ $("#gallery").classList.remove("open"); setTimeout(()=>$("#gallery").hidden=true,250); $("#backdrop").hidden=true; };
$("#btnWipeGallery").onclick=()=>{ if(confirm("모두 삭제?")){ Object.keys(localStorage).filter(k=>k.startsWith("photo:")).forEach(k=>localStorage.removeItem(k)); renderGallery(); } };
$("#backdrop").onclick=()=>{ $("#gallery").classList.remove("open"); setTimeout(()=>$("#gallery").hidden=true,250); $("#backdrop").hidden=true; };

$("#btnReset").onclick=()=>{ shots=[];selected.clear();finalDataUrl=null;renderThumbs();renderPreview();updateCounter(); };
$("#btnFlip").onclick=()=>{ alert("카메라 전환은 브라우저별 지원 필요"); };

