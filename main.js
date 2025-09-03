// ---------- helpers ----------
const $  = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => [...r.querySelectorAll(q)];
const on = (sel, type, handler) => { const el = $(sel); if (el) el.addEventListener(type, handler); };

// global state
let stream = null;
let shots = [];               // dataURL 배열 (최대 6)
let selected = new Set();     // 선택된 index 4개
let finalDataUrl = null;
let autoTimer = null, autoRunning = false;
let remain = 6, currentFacing = "user";

// ---------- pages ----------
const PAGES = { landing:"#pageLanding", howto:"#pageHowto", camera:"#pageCamera", select:"#pageSelect", edit:"#pageEdit" };
function showPage(name) {
  $$(".page").forEach(el => el.classList.remove("active"));
  const target = $(PAGES[name]); if (target) target.classList.add("active");
  const steps = $(".steps"); const visible = ["camera","select","edit"].includes(name);
  if (steps) steps.style.display = visible ? "flex" : "none";
  $$(".step").forEach(s => s.classList.toggle("active", s.dataset.step === name));
  if (name !== "camera") stopAutoCapture();
}

// ---------- QR popup ----------
function forceHideQrPopup(){
  const p = $("#qrPopup"); if (!p) return;
  p.style.display = "none";
  const box = $("#qrPopupContainer"); if (box) box.innerHTML = "";
  const l = $("#qrLoading"); if (l) l.style.display = "none";
  const e = $("#qrError");  if (e) { e.style.display = "none"; e.textContent = ""; }
}
function computeQrPopupSize(){ return Math.max(160, Math.floor(Math.min(window.innerWidth * 0.6, 260))); }
function openQrPopup(url){
  const p=$("#qrPopup"), w=$("#qrPopupContainer"); if (!p || !w) return;
  w.innerHTML="";
  // eslint-disable-next-line no-undef
  new QRCode(w,{text:url,width:computeQrPopupSize(),height:computeQrPopupSize(),correctLevel:QRCode.CorrectLevel.M});
  p.style.display='flex';
}
function closeQrPopup(){ resetSession(); const p = $("#qrPopup"); if (p) p.style.display='none'; showPage('camera'); }
window.closeQrPopup = closeQrPopup;

// ---------- camera ----------
async function startCamera() {
  try {
    if (!("mediaDevices" in navigator)) throw new Error("이 브라우저는 카메라를 지원하지 않습니다.");
    if (!location.protocol.startsWith("https")) { alert("카메라는 HTTPS에서만 동작합니다. GitHub Pages 주소(https://...)로 접속하세요."); return; }
    if (stream) stopCamera();
    const constraints = { video:{ facingMode: currentFacing, width:{ideal:720}, height:{ideal:960}, aspectRatio:{ideal:0.75} }, audio:false };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = $("#video");
    video.srcObject = stream;
    video.onloadedmetadata = () => { video.play(); video.classList.toggle("mirror", currentFacing === "user"); };
    $("#btnShot").disabled = false;
  } catch (e) { alert("카메라 접근 실패: " + e.message); }
}
function stopCamera() { stream?.getTracks().forEach(t => t.stop()); stream = null; }

// ---------- capture ----------
function triggerFlash(){ const f = $("#flash"); f.classList.add("active"); setTimeout(()=>f.classList.remove("active"), 250); }
function updateCountdownUI(t){ const el=$("#countdown"); if(!el) return; const show = typeof t==="number" ? t>0 : !!t; if(show){ el.textContent=t; el.style.display="block"; } else { el.textContent=""; el.style.display="none"; } }
function stopAutoCapture(){ autoRunning=false; if(autoTimer){ clearInterval(autoTimer); autoTimer=null; } updateCountdownUI(""); }
async function startAutoCapture(){
  shots=[]; selected.clear(); finalDataUrl=null; renderThumbs(); renderPreview(); updateCounter(); toggleNextButtons();
  autoRunning=true; remain=6; if (autoTimer) clearInterval(autoTimer);
  updateCountdownUI(remain);
  autoTimer=setInterval(()=> {
    if(!autoRunning){ clearInterval(autoTimer); autoTimer=null; updateCountdownUI(""); return; }
    remain--; updateCountdownUI(remain>0 ? remain : "");
    if(remain<=0){
      remain=6;
      if(shots.length<=5){ triggerFlash(); doCapture(); }
      else{ stopAutoCapture(); toggleNextButtons(); showPage("select"); }
    }
  },1000);
}
function doCapture(){
  const video = $("#video");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || video.clientWidth || 720;
  canvas.height = video.videoHeight || video.clientHeight || 960;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  if (shots.length < 6) { shots.push(dataUrl); renderThumbs(); updateCounter(); toggleNextButtons(); }
}
function updateCounter(){ $("#shotCounter").textContent = `${shots.length} / 6`; }

// ---------- select & preview ----------
function renderThumbs(){
  const grid = $("#thumbGrid"); grid.innerHTML = "";
  shots.forEach((src, idx) => {
    const d=document.createElement("div");
    d.className = "thumb" + (selected.has(idx) ? " sel" : "");
    d.innerHTML = `<img src="${src}" alt="shot ${idx + 1}">`;
    d.onclick = () => {
      if (selected.has(idx)) selected.delete(idx); else if (selected.size < 4) selected.add(idx);
      renderThumbs(); renderPreview(); toggleNextButtons();
      if (selected.size === 4) { const sel = $("#frameDesign"); if (sel && sel.value) applyFrameDesign(sel.value); showPage("edit"); }
    };
    grid.appendChild(d);
  });
}
function renderPreview(){
  const grid = $("#finalGrid"); if (!grid) return; grid.innerHTML = "";
  [...selected].forEach(i => { const cell=document.createElement("div"); cell.className="cell"; cell.innerHTML=`<img src="${shots[i]}" alt="selected ${i+1}">`; grid.appendChild(cell); });
}
function toggleNextButtons(){
  $("#toSelect").disabled = shots.length < 6;
  const ok4 = (selected.size === 4);
  $("#toEdit").disabled = !ok4;
  const btnMake = $("#btnMake"); if (btnMake) btnMake.disabled = !ok4;
}

// ---------- manual compose helpers ----------
function loadImageSafe(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 로드 실패: " + src));
    img.src = src;
  });
}
function roundRectPath(ctx, x, y, w, h, r){
  const rr = Math.max(0, Math.min(r, Math.min(w,h)/2));
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}
function drawCover(ctx, img, x, y, w, h){
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// ---------- compose (html2canvas 비사용, 수동 합성) ----------
const FRAME_PRESETS = {
  frame1:{ bg:'./frame1.jpg', top:.035, bottom:.175, side:.035, gap:.032, pad:.012, radius:12 },
  frame2:{ bg:'./frame2.jpg', top:.038, bottom:.175, side:.035, gap:.032, pad:.010, radius:10 },
  frame3:{ bg:'./frame3.jpg', top:.026, bottom:.190, side:.026, gap:.024, pad:0,    radius: 2 }
};
async function composeFourcutManual(){
  // 출력 해상도 (품질·용량 균형)
  const W = 1600; const H = Math.round(W * 3/2); // 2:3 비율
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // 현재 프레임 결정
  const node = $("#fourcut");
  const selectedKey = ["frame1","frame2","frame3"].find(k => node.classList.contains(k)) || ($("#frameDesign")?.value || "");
  const preset = FRAME_PRESETS[selectedKey] || { top:.05, bottom:.12, side:.05, gap:.03, pad:0.008, radius:12, bg:null };

  // 배경
  if (preset.bg) {
    const bg = await loadImageSafe(preset.bg);
    ctx.drawImage(bg, 0, 0, W, H);
  } else {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    // 폴라로이드 느낌 바닥 여백 (선택)
    // ctx.fillStyle = "#f9f9f9"; ctx.fillRect(0, H*0.86, W, H*0.14);
  }

  // 그리드 영역 계산
  const gridL = Math.round(preset.side * W);
  const gridR = Math.round(preset.side * W);
  const gridT = Math.round(preset.top  * H);
  const gridB = Math.round(preset.bottom * H);
  const gridW = W - gridL - gridR;
  const gridH = H - gridT - gridB;
  const gap = Math.round(preset.gap * gridW);

  // 셀 크기 (2×2, 가로 기준; 세로는 3:4 비율)
  const cellW = Math.floor((gridW - gap) / 2);
  const cellH = Math.floor(cellW * 4 / 3);
  const totalH = cellH * 2 + gap;
  const yStart = Math.round(gridT + (gridH - totalH) / 2);
  const x1 = gridL, x2 = gridL + cellW + gap;
  const y1 = yStart, y2 = yStart + cellH + gap;

  const ids = [...selected]; // 선택 순서대로
  for (let i = 0; i < 4; i++) {
    const img = await loadImageSafe(shots[ids[i]]);
    const x = (i % 2 === 0) ? x1 : x2;
    const y = (i < 2) ? y1 : y2;
    const pad = Math.round((preset.pad || 0) * cellW);
    const rx = x + pad, ry = y + pad, rw = cellW - pad*2, rh = cellH - pad*2;
    const r  = Math.round((preset.radius || 12) * (W / 1600)); // 해상도에 맞춘 라운드

    ctx.save();
    roundRectPath(ctx, rx, ry, rw, rh, r);
    ctx.clip();
    drawCover(ctx, img, rx, ry, rw, rh);
    ctx.restore();
  }

  return canvas.toDataURL("image/jpeg", /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent) ? 0.82 : 0.92);
}

async function makeFourcut(){
  if (selected.size !== 4) return alert("4장을 선택하세요");
  const btnMake = $("#btnMake"); const btnSave = $("#btnSave");
  if (btnMake) { btnMake.disabled = true; btnMake.textContent = "합성 중..."; }
  try {
    finalDataUrl = await composeFourcutManual();
    if (btnSave) { btnSave.disabled = false; btnSave.removeAttribute("disabled"); btnSave.setAttribute("aria-disabled","false"); }
  } catch (err) {
    console.error(err);
    alert("4컷 만들기 실패: " + (err?.message || err));
  } finally {
    if (btnMake) { btnMake.disabled = false; btnMake.textContent = "4컷 만들기"; }
  }
}

// ---------- gallery & save ----------
async function saveImage(){
  if (!finalDataUrl) return;
  const id = Date.now();
  localStorage.setItem("photo:" + id, JSON.stringify({ id, createdAt: Date.now(), image: finalDataUrl }));
  await renderGallery();
  await showQrPopupWithUpload();
}
function resetSession(){
  shots = []; selected.clear(); finalDataUrl = null;
  renderThumbs(); renderPreview(); updateCounter();
  $("#btnSave").disabled = true; $("#btnMake").disabled = true;
  toggleNextButtons(); stopAutoCapture();
}
async function renderGallery(){
  const grid = $("#galleryGrid"); grid.innerHTML = "";
  const items = Object.keys(localStorage).filter(k => k.startsWith("photo:"))
    .map(k => JSON.parse(localStorage.getItem(k))).sort((a,b)=>b.createdAt-a.createdAt);
  if (!items.length){ grid.innerHTML = "<div style='grid-column:1/-1;text-align:center;color:#999'>저장된 사진 없음</div>"; return; }
  for (const it of items){
    const wrap=document.createElement("div");
    wrap.className="g-item";
    wrap.innerHTML=`<img src="${it.image}" alt=""><button class="del">×</button>`;
    wrap.querySelector(".del").onclick=()=>{ localStorage.removeItem("photo:"+it.id); renderGallery(); };
    grid.appendChild(wrap);
  }
}

// ---------- frames ----------
function applyFrameDesign(key){
  const node = $("#fourcut");
  node.classList.remove("frame1","frame2","frame3");
  if (key) node.classList.add(key);
  // 프레임 바뀌면 이전 합성 결과 무효화
  finalDataUrl = null;
  $("#btnSave").disabled = true;
}

// ---------- Cloudinary ----------
const CLOUD_NAME = 'djqkuxfki', UPLOAD_PRESET = 'fourcut_unsigned';
async function uploadFinalToCloudinary(){
  const blob = await (await fetch(finalDataUrl)).blob();
  if (blob.size > 10 * 1024 * 1024) throw new Error(`이미지가 너무 큽니다 (${(blob.size/1024/1024).toFixed(1)}MB).`);
  const form = new FormData();
  form.append('file', blob);
  form.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method:'POST', body: form, mode: 'cors', credentials: 'omit', cache: 'no-store'
  });
  if (!res.ok) { const txt = await res.text().catch(()=> ""); throw new Error(`업로드 실패(${res.status}). ${txt?.slice(0,120)}`); }
  const data = await res.json();
  if (!data.secure_url) throw new Error("업로드 응답에 secure_url이 없습니다.");
  return data.secure_url;
}
function makeViewerUrl(u){ const v = new URL('viewer.html', location.href); v.searchParams.set('img', u); return v.toString(); }
async function showQrPopupWithUpload(){
  forceHideQrPopup();
  const loading = $("#qrLoading"); if (loading) loading.style.display = "block";
  const cont = $("#qrPopupContainer"); if (cont) cont.innerHTML = "";
  const p = $("#qrPopup"); if (p) p.style.display='flex';
  try{
    const url = await uploadFinalToCloudinary();
    if (loading) loading.style.display = "none";
    openQrPopup(makeViewerUrl(url));
  }catch(err){
    console.error(err);
    if (loading) loading.style.display = "none";
    const e = $("#qrError"); if (e){ e.style.display = "block"; e.textContent = "QR 생성 실패: " + err.message; }
    const w = $("#qrPopupContainer");
    if (w){
      const retry = document.createElement("button");
      retry.textContent = "다시 시도"; retry.className = "ghost";
      retry.onclick = () => { forceHideQrPopup(); showQrPopupWithUpload(); };
      w.innerHTML = ""; w.appendChild(retry);
    }
  }
}

// ---------- init ----------
function init(){
  showPage("landing"); forceHideQrPopup();

  // 네비
  on("#btnGoHowto","click", () => showPage("howto"));
  on("#btnToCamera","click", () => showPage("camera"));

  // 단계 이동
  on("#toSelect","click", () => { stopAutoCapture(); showPage("select"); });
  on("#toEdit","click",   () => { stopAutoCapture(); renderPreview(); showPage("edit"); });
  on("#backToCamera","click", () => { stopAutoCapture(); showPage("camera"); });
  on("#backToSelect","click", () => { stopAutoCapture(); showPage("select"); });

  // 카메라
  on("#btnStart","click", async () => { await startCamera(); startAutoCapture(); });
  on("#btnShot","click",  () => { triggerFlash(); doCapture(); if (autoRunning){ remain = 6; updateCountdownUI(remain); } });
  on("#btnReset","click", () => resetSession());
  on("#btnFlip","click",  async () => { currentFacing = (currentFacing === "user") ? "environment" : "user"; await startCamera(); });

  // 프레임
  const frameSelect = $("#frameDesign");
  if (frameSelect){
    frameSelect.value = 'frame1';
    applyFrameDesign('frame1');
    frameSelect.addEventListener("input", (e) => applyFrameDesign(e.target.value));
  }

  // 만들기/저장
  on("#btnMake","click", makeFourcut);
  on("#btnSave","click", saveImage);

  // 갤러리
  on("#btnGallery","click", async () => {
    const pass = prompt("갤러리 암호 입력:");
    if (pass === "1111") {
      await renderGallery();
      $("#gallery").hidden = false;
      $("#gallery").classList.add("open");
      $("#backdrop").hidden = false;
    } else if (pass !== null) alert("암호가 틀렸습니다.");
  });
  on("#btnCloseGallery","click", () => {
    $("#gallery").classList.remove("open");
    setTimeout(() => $("#gallery").hidden = true, 250);
    $("#backdrop").hidden = true;
  });
  on("#btnWipeGallery","click", () => {
    if (confirm("모두 삭제?")) {
      Object.keys(localStorage).filter(k => k.startsWith("photo:")).forEach(k => localStorage.removeItem(k));
      renderGallery();
    }
  });
  on("#backdrop","click", () => {
    $("#gallery").classList.remove("open");
    setTimeout(() => $("#gallery").hidden = true, 250);
    $("#backdrop").hidden = true;
  });

  toggleNextButtons();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
window.addEventListener("pageshow", forceHideQrPopup);
