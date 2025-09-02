// ---------- helpers ----------
const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => [...r.querySelectorAll(q)];

let stream = null;
let shots = [];               // dataURL 배열 (최대 6)
let selected = new Set();     // 선택된 index 4개
let finalDataUrl = null;
let autoTimer = null, autoRunning = false;
let remain = 6, currentFacing = "user", currentDeviceId = null;

// ---------- 페이지 전환 ----------
const PAGES = { camera: "#pageCamera", select: "#pageSelect", edit: "#pageEdit" };
function showPage(name) {
  Object.values(PAGES).forEach(sel => $(sel).classList.remove("active"));
  $(PAGES[name]).classList.add("active");
  $$(".step").forEach(s => s.classList.toggle("active", s.dataset.step === name));
}

// ---------- 카메라 ----------
async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const sel = $("#cameraSelect");
  if (!sel) return;
  sel.innerHTML = "";
  devices.filter(d => d.kind === "videoinput").forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    opt.textContent = d.label || `카메라 ${i + 1}`;
    sel.appendChild(opt);
  });
  if (!currentDeviceId && sel.options.length > 0) currentDeviceId = sel.options[0].value;
  sel.value = currentDeviceId || "";
}
async function startCamera() {
  try {
    if (!location.protocol.startsWith("https")) {
      alert("카메라는 HTTPS에서만 동작합니다. GitHub Pages 주소(https://...)로 접속하세요.");
      return;
    }
    if (stream) stopCamera();
    const constraints = currentDeviceId
      ? { video: { deviceId: { exact: currentDeviceId } }, audio: false }
      : { video: { facingMode: currentFacing }, audio: false };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = $("#video");
    if (video) {
      video.srcObject = stream;
      video.onloadedmetadata = () => video.play();
    }
    if ($("#btnShot")) $("#btnShot").disabled = false;
  } catch (e) {
    alert("카메라 접근 실패: " + e.message);
  }
}
function stopCamera() {
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
}

// ---------- 촬영 ----------
function triggerFlash() {
  const f = $("#flash");
  if (!f) return;
  f.classList.add("active");
  setTimeout(() => f.classList.remove("active"), 250);
}
function updateCountdownUI(t) {
  const el = $("#countdown");
  if (el) el.textContent = t;
}

async function startAutoCapture() {
  shots = [];
  selected.clear();
  finalDataUrl = null;
  renderThumbs();
  renderPreview();
  updateCounter();
  toggleNextButtons();

  autoRunning = true;
  remain = 6;
  if (autoTimer) clearInterval(autoTimer);

  updateCountdownUI(remain);
  autoTimer = setInterval(() => {
    if (!autoRunning) {
      clearInterval(autoTimer);
      updateCountdownUI("");
      return;
    }
    remain--;
    updateCountdownUI(remain > 0 ? remain : "");
    if (remain <= 0) {
      triggerFlash();
      doCapture();
      remain = 6;
      if (shots.length >= 6) {
        autoRunning = false;
        clearInterval(autoTimer);
        updateCountdownUI("");
        toggleNextButtons();
        showPage("select");
      }
    }
  }, 1000);
}
function doCapture() {
  const video = $("#video");
  if (!video) return;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  if (shots.length < 6) {
    shots.push(dataUrl);
    renderThumbs();
    updateCounter();
    toggleNextButtons();
  }
}
function updateCounter() {
  const el = $("#shotCounter");
  if (el) el.textContent = `${shots.length} / 6`;
}

// ---------- 선택 & 미리보기 ----------
function renderThumbs() {
  const grid = $("#thumbGrid");
  if (!grid) return;
  grid.innerHTML = "";
  shots.forEach((src, idx) => {
    const d = document.createElement("div");
    d.className = "thumb" + (selected.has(idx) ? " sel" : "");
    d.innerHTML = `<img src="${src}" alt="shot ${idx + 1}">`;
    d.onclick = () => {
      if (selected.has(idx)) selected.delete(idx);
      else if (selected.size < 4) selected.add(idx);
      renderThumbs();
      renderPreview();
      toggleNextButtons();
    };
    grid.appendChild(d);
  });
}
function renderPreview() {
  const grid = $("#finalGrid");
  if (!grid) return;
  grid.innerHTML = "";
  [...selected].forEach(i => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.innerHTML = `<img src="${shots[i]}" alt="selected ${i + 1}">`;
    grid.appendChild(cell);
  });
}
function toggleNextButtons() {
  if ($("#toSelect")) $("#toSelect").disabled = shots.length < 6;
  const ok4 = (selected.size === 4);
  if ($("#toEdit")) $("#toEdit").disabled = !ok4;
  if ($("#btnMake")) $("#btnMake").disabled = !ok4;
}

// ---------- 이미지 안전화 ----------
async function inlineImageToDataURL(imgEl) {
  if (!imgEl || imgEl.src.startsWith("data:")) return;
  try {
    const res = await fetch(imgEl.src, { mode: "cors" });
    const blob = await res.blob();
    const reader = new FileReader();
    const dataURL = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    imgEl.src = dataURL;
  } catch {
    imgEl.setAttribute("data-html2canvas-ignore", "true");
  }
}
async function prepareImagesForCapture(node) {
  const imgs = node.querySelectorAll("img");
  for (const img of imgs) {
    await inlineImageToDataURL(img);
  }
}

// ---------- 합성 ----------
async function makeFourcut() {
  if (selected.size !== 4) return alert("4장을 선택하세요");
  const node = $("#fourcut");
  if (!node) return;
  await prepareImagesForCapture(node);
  const canvas = await html2canvas(node, {
    backgroundColor: null,
    useCORS: true,
    allowTaint: false,
    scale: 2
  });
  finalDataUrl = canvas.toDataURL("image/jpeg", 0.92);
  if ($("#btnSave")) $("#btnSave").disabled = false;
}

// ---------- 저장 & 갤러리 ----------
async function saveImage() {
  if (!finalDataUrl) return;
  const id = Date.now();
  localStorage.setItem(
    "photo:" + id,
    JSON.stringify({ id, createdAt: Date.now(), image: finalDataUrl })
  );
  await renderGallery();
  await showQrPopupWithUpload();
}
function resetSession() {
  shots = [];
  selected.clear();
  finalDataUrl = null;
  renderThumbs();
  renderPreview();
  updateCounter();
  if ($("#btnSave")) $("#btnSave").disabled = true;
  if ($("#btnMake")) $("#btnMake").disabled = true;
  toggleNextButtons();
}
async function renderGallery() {
  const grid = $("#galleryGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const items = Object.keys(localStorage)
    .filter(k => k.startsWith("photo:"))
    .map(k => JSON.parse(localStorage.getItem(k)))
    .sort((a, b) => b.createdAt - a.createdAt);

  if (!items.length) {
    grid.innerHTML =
      "<div style='grid-column:1/-1;text-align:center;color:#999'>저장된 사진 없음</div>";
    return;
  }
  for (const it of items) {
    const wrap = document.createElement("div");
    wrap.className = "g-item";
    wrap.innerHTML = `<img src="${it.image}" alt=""><button class="del">×</button>`;
    wrap.querySelector(".del").onclick = () => {
      localStorage.removeItem("photo:" + it.id);
      renderGallery();
    };
    grid.appendChild(wrap);
  }
}

// ---------- 프레임/글씨 색상 ----------
function updateFrame(){
  const s = $("#frameStyle")?.value,
        c = $("#frameColor")?.value,
        f = $("#fourcut");
  if (!f) return;
  if (s === "polaroid"){ f.className = "fourcut polaroid"; f.style.background = c; }
  else if (s === "solid"){ f.className = "fourcut solid"; f.style.background = c; }
  else if (s === "gradientLight"){ f.className="fourcut gradient"; f.style.background=`linear-gradient(135deg, ${c} 0%, #fff 100%)`; }
  else { f.className="fourcut gradient"; f.style.background=`linear-gradient(135deg, ${c} 0%, #000 100%)`; }
}
function updateFontColor(){
  const c = $("#fontColor")?.value;
  const el = $(".fc-title");
  if (el) el.style.color = c;
}

// ---------- Cloudinary 업로드 + QR ----------
const CLOUD_NAME = 'djqkuxfki', UPLOAD_PRESET = 'fourcut_unsigned';

function setQrState({loading=false, error=""} = {}) {
  if ($("#qrLoading")) $("#qrLoading").style.display = loading ? "block" : "none";
  if ($("#qrError")) {
    $("#qrError").style.display = error ? "block" : "none";
    $("#qrError").textContent = error || "";
  }
}
function computeQrPopupSize(){ return Math.max(160, Math.floor(Math.min(window.innerWidth * 0.6, 260))); }
function openQrPopup(url){
  const p=$("#qrPopup"), w=$("#qrPopupContainer");
  if (!p||!w) return;
  w.innerHTML="";
  new QRCode(w,{text:url,width:computeQrPopupSize(),height:computeQrPopupSize(),correctLevel:QRCode.CorrectLevel.M});
  p.style.display='flex';
}
function closeQrPopup(){ resetSession(); if($("#qrPopup")) $("#qrPopup").style.display='none'; showPage('camera'); }

async function uploadFinalToCloudinary(){
  const blob = await (await fetch(finalDataUrl)).blob();
  if (blob.size > 10 * 1024 * 1024) {
    throw new Error(`이미지가 너무 큽니다 (${(blob.size/1024/1024).toFixed(1)}MB).`);
  }
  const form = new FormData();
  form.append('file', blob);
  form.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method:'POST', body: form, mode: 'cors', credentials: 'omit', cache: 'no-store'
  });
  if (!res.ok) throw new Error("업로드 실패");
  const data = await res.json();
  if (!data.secure_url) throw new Error("업로드 응답 오류");
  return data.secure_url;
}
async function showQrPopupWithUpload(){
  setQrState({loading:true, error:""});
  if($("#qrPopup")) $("#qrPopup").style.display='flex';
  if($("#qrPopupContainer")) $("#qrPopupContainer").innerHTML = "";
  try{
    const url = await uploadFinalToCloudinary();
    setQrState({loading:false});
    openQrPopup(makeViewerUrl(url));
  }catch(err){
    console.error(err);
    setQrState({loading:false, error: "QR 생성 실패: " + err.message});
    const w = $("#qrPopupContainer");
    if (w) {
      const retry = document.createElement("button");
      retry.textContent = "다시 시도";
      retry.className = "ghost";
      retry.onclick = () => { setQrState({loading:true, error:""}); showQrPopupWithUpload(); };
      w.innerHTML = "";
      w.appendChild(retry);
    }
  }
}
function makeViewerUrl(u){
  const v = new URL('viewer.html', location.href);
  v.searchParams.set('img', u);
  return v.toString();
}

// ---------- 이벤트 ----------
document.addEventListener("DOMContentLoaded", async () => {
  await listCameras();

  if($("#toSelect")) $("#toSelect").onclick = () => showPage("select");
  if($("#toEdit")) $("#toEdit").onclick = () => { renderPreview(); showPage("edit"); };
  if($("#backToCamera")) $("#backToCamera").onclick = () => showPage("camera");
  if($("#backToSelect")) $("#backToSelect").onclick = () => showPage("select");

  if($("#cameraSelect")) $("#cameraSelect").onchange = () => { currentDeviceId = $("#cameraSelect").value; };
  if($("#btnStart")) $("#btnStart").onclick = async () => { await startCamera(); startAutoCapture(); };
  if($("#btnShot")) $("#btnShot").onclick  = () => { triggerFlash(); doCapture(); if (autoRunning){ remain = 6; updateCountdownUI(remain); } };
  if($("#btnReset")) $("#btnReset").onclick = () => resetSession();
  if($("#btnFlip")) $("#btnFlip").onclick  = async () => {
    currentFacing = (currentFacing === "user") ? "environment" : "user";
    currentDeviceId = null;
    await startCamera();
  };

  if($("#frameStyle")) $("#frameStyle").oninput = updateFrame;
  if($("#frameColor")) $("#frameColor").oninput = updateFrame;
  if($("#fontColor")) $("#fontColor").oninput  = updateFontColor;
  if($("#btnMake")) $("#btnMake").onclick    = makeFourcut;
  if($("#btnSave")) $("#btnSave").onclick    = saveImage;

  if($("#btnGallery")) $("#btnGallery").onclick = async () => {
    const pass = prompt("갤러리 암호 입력:");
    if (pass === "posungprogramming") {
      await renderGallery();
      if($("#gallery")) { $("#gallery").hidden = false; $("#gallery").classList.add("open"); }
      if($("#backdrop")) $("#backdrop").hidden = false;
    } else if (pass !== null) alert("암호가 틀렸습니다.");
  };
  if($("#btnCloseGallery")) $("#btnCloseGallery").onclick = () => {
    if($("#gallery")) $("#gallery").classList.remove("open");
    setTimeout(() => { if($("#gallery")) $("#gallery").hidden = true; }, 250);
    if($("#backdrop")) $("#backdrop").hidden = true;
  };
  if($("#btnWipeGallery")) $("#btnWipeGallery").onclick = () => {
    if (confirm("모두 삭제?")) {
      Object.keys(localStorage).filter(k => k.startsWith("photo:")).forEach(k => localStorage.removeItem(k));
      renderGallery();
    }
  };
  if($("#backdrop")) $("#backdrop").onclick = () => {
    if($("#gallery")) $("#gallery").classList.remove("open");
    setTimeout(() => { if($("#gallery")) $("#gallery").hidden = true; }, 250);
    if($("#backdrop")) $("#backdrop").hidden = true;
  };

  updateFrame();
  updateFontColor();
  toggleNextButtons();
});
