// ---------- helpers ----------
const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => [...r.querySelectorAll(q)];

let stream = null;
let shots = [];               // dataURL 배열 (최대 6)
let selected = new Set();     // 선택된 index 4개
let finalDataUrl = null;
let autoTimer = null, autoRunning = false;
let remain = 6, currentFacing = "user";

// ---------- 페이지 전환 ----------
const PAGES = {
  landing: "#pageLanding",
  howto:   "#pageHowto",
  camera:  "#pageCamera",
  select:  "#pageSelect",
  edit:    "#pageEdit"
};
function showPage(name) {
  document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
  const target = $(PAGES[name]);
  if (target) target.classList.add("active");

  const steps = $(".steps");
  const visible = ["camera","select","edit"].includes(name);
  if (steps) steps.style.display = visible ? "flex" : "none";

  $$(".step").forEach(s => s.classList.toggle("active", s.dataset.step === name));
}

// ---------- QR 팝업 강제 비활성(리로드/복원 대응) ----------
function forceHideQrPopup(){
  const p = $("#qrPopup");
  if (!p) return;
  p.style.display = "none";                   // 보이던 상태 강제 닫기
  const box = $("#qrPopupContainer");
  if (box) box.innerHTML = "";                // QR 코드 캔버스 제거
  const l = $("#qrLoading"); if (l) l.style.display = "none";
  const e = $("#qrError");   if (e) { e.style.display = "none"; e.textContent = ""; }
}

// ---------- 카메라 ----------
async function startCamera() {
  try {
    if (!location.protocol.startsWith("https")) {
      alert("카메라는 HTTPS에서만 동작합니다. GitHub Pages 주소(https://...)로 접속하세요.");
      return;
    }
    if (stream) stopCamera();
    const constraints = {
      video: {
        facingMode: currentFacing,
        width: { ideal: 720 },
        height: { ideal: 960 },
        aspectRatio: { ideal: 0.75 }
      },
      audio: false
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = $("#video");
    video.srcObject = stream;
    video.onloadedmetadata = () => video.play();
    $("#btnShot").disabled = false;
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
  f.classList.add("active");
  setTimeout(() => f.classList.remove("active"), 250);
}
function updateCountdownUI(t) {
  $("#countdown").textContent = t;
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
      remain = 6;
      if (shots.length <= 5) {
        triggerFlash();
        doCapture();
      } else {
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
  $("#shotCounter").textContent = `${shots.length} / 6`;
}

// ---------- 선택 & 미리보기 ----------
function renderThumbs() {
  const grid = $("#thumbGrid");
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

      if (selected.size === 4) {
        const fd = $("#frameDesign");
        if (fd && fd.value) applyFrameDesign(fd.value);
        showPage("edit");
      }
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
  $("#toSelect").disabled = shots.length < 6;
  const ok4 = (selected.size === 4);
  $("#toEdit").disabled = !ok4;
  const btnMake = $("#btnMake");
  if (btnMake) btnMake.disabled = !ok4;
}

// ---------- 로고 안전화(dataURL 인라인) ----------
async function inlineImageToDataURL(imgEl) {
  if (!imgEl || imgEl.src.startsWith("data:")) return;
  try {
    const res = await fetch(imgEl.src, { mode: "cors" });
    const blob = await res.blob();
    const reader = new FileReader();
    const dataURL = await new Promise(r => { reader.onload = () => r(reader.result); reader.readAsDataURL(blob); });
    imgEl.src = dataURL;
  } catch {
    imgEl.setAttribute("data-html2canvas-ignore", "true");
  }
}
async function prepareLogosForCapture() {
  await inlineImageToDataURL($(".fc-logo"));
}

// ---------- 환경 감지 ----------
function isMobile(){
  return /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent);
}

// ---------- 합성 ----------
async function makeFourcut() {
  if (selected.size !== 4) return alert("4장을 선택하세요");
  await prepareLogosForCapture();
  const node = $("#fourcut");
  const canvas = await html2canvas(node, {
    backgroundColor: null,
    useCORS: true,
    allowTaint: false,
    scale: isMobile() ? 1.25 : 2
  });
  const quality = isMobile() ? 0.82 : 0.92;
  finalDataUrl = canvas.toDataURL("image/jpeg", quality);
  $("#btnSave").disabled = false;
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
  $("#btnSave").disabled = true;
  $("#btnMake").disabled = true;
  toggleNextButtons();
}
async function renderGallery() {
  const grid = $("#galleryGrid");
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

// ---------- 프레임 디자인 ----------
function applyFrameDesign(key){
  const node = $("#fourcut");
  node.classList.remove("frame1","frame2","frame3");
  if (key) node.classList.add(key);
}

// ---------- Cloudinary 업로드 + QR ----------
const CLOUD_NAME = 'djqkuxfki', UPLOAD_PRESET = 'fourcut_unsigned';

function setQrState({loading=false, error=""} = {}) {
  const l = $("#qrLoading"), e = $("#qrError");
  if (l) l.style.display = loading ? "block" : "none";
  if (e) {
    e.style.display = error ? "block" : "none";
    e.textContent = error || "";
  }
}
function computeQrPopupSize(){ return Math.max(160, Math.floor(Math.min(window.innerWidth * 0.6, 260))); }
function openQrPopup(url){
  const p=$("#qrPopup"), w=$("#qrPopupContainer");
  w.innerHTML="";
  new QRCode(w,{text:url,width:computeQrPopupSize(),height:computeQrPopupSize(),correctLevel:QRCode.CorrectLevel.M});
  p.style.display='flex';
}
function closeQrPopup(){
  resetSession();
  const p = $("#qrPopup");
  if (p) p.style.display='none';
  showPage('camera');
}
async function uploadFinalToCloudinary(){
  const blob = await (await fetch(finalDataUrl)).blob();
  if (blob.size > 10 * 1024 * 1024) {
    throw new Error(`이미지가 너무 큽니다 (${(blob.size/1024/1024).toFixed(1)}MB).`);
  }
  const form = new FormData();
  form.append('file', blob);
  form.append('upload_preset', UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method:'POST',
    body: form,
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store'
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> "");
    throw new Error(`업로드 실패(${res.status}). ${txt?.slice(0,120)}`);
  }
  const data = await res.json();
  if (!data.secure_url) throw new Error("업로드 응답에 secure_url이 없습니다.");
  return data.secure_url;
}
async function showQrPopupWithUpload(){
  // 팝업 강제 초기화 후 열기 (중복 방지)
  forceHideQrPopup();
  const loading = $("#qrLoading");
  if (loading) loading.style.display = "block";
  const cont = $("#qrPopupContainer");
  if (cont) cont.innerHTML = "";
  const p = $("#qrPopup");
  if (p) p.style.display='flex';

  try{
    const url = await uploadFinalToCloudinary();
    if (loading) loading.style.display = "none";
    openQrPopup(makeViewerUrl(url));
  }catch(err){
    console.error(err);
    if (loading) loading.style.display = "none";
    const e = $("#qrError");
    if (e){
      e.style.display = "block";
      e.textContent = "QR 생성 실패: " + err.message;
    }
    const w = $("#qrPopupContainer");
    if (w){
      const retry = document.createElement("button");
      retry.textContent = "다시 시도";
      retry.className = "ghost";
      retry.onclick = () => { forceHideQrPopup(); showQrPopupWithUpload(); };
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
document.addEventListener("DOMContentLoaded", () => {
  // 초기 진입: 메인 페이지
  showPage("landing");

  // 새로고침/복원 시 QR 팝업 절대 보이지 않게
  forceHideQrPopup();
});
window.addEventListener("pageshow", () => {
  // BFCache 복원될 때도 팝업 강제 닫기
  forceHideQrPopup();
});

document.addEventListener("DOMContentLoaded", async () => {
  // 메인 → 이용방법
  $("#btnGoHowto").onclick = () => showPage("howto");
  // 이용방법 → 촬영
  $("#btnToCamera").onclick = () => showPage("camera");

  // 기존 단계 이동
  $("#toSelect").onclick = () => showPage("select");
  $("#toEdit").onclick = () => { renderPreview(); showPage("edit"); };
  $("#backToCamera").onclick = () => showPage("camera");
  $("#backToSelect").onclick = () => showPage("select");

  // 카메라
  $("#btnStart").onclick = async () => { await startCamera(); startAutoCapture(); };
  $("#btnShot").onclick  = () => { triggerFlash(); doCapture(); if (autoRunning){ remain = 6; updateCountdownUI(remain); } };
  $("#btnReset").onclick = () => resetSession();
  $("#btnFlip").onclick  = async () => {
    currentFacing = (currentFacing === "user") ? "environment" : "user";
    await startCamera();
  };

  // 프레임 선택
  const fd = $("#frameDesign");
  if (fd) fd.addEventListener("input", (e) => applyFrameDesign(e.target.value));

  // 만들기/저장
  $("#btnMake").onclick    = makeFourcut;
  $("#btnSave").onclick    = saveImage;

  // 갤러리
  $("#btnGallery").onclick = async () => {
    const pass = prompt("갤러리 암호 입력:");
    if (pass === "1111") {
      await renderGallery();
      $("#gallery").hidden = false;
      $("#gallery").classList.add("open");
      $("#backdrop").hidden = false;
    } else if (pass !== null) alert("암호가 틀렸습니다.");
  };
  $("#btnCloseGallery").onclick = () => {
    $("#gallery").classList.remove("open");
    setTimeout(() => $("#gallery").hidden = true, 250);
    $("#backdrop").hidden = true;
  };
  $("#btnWipeGallery").onclick = () => {
    if (confirm("모두 삭제?")) {
      Object.keys(localStorage).filter(k => k.startsWith("photo:")).forEach(k => localStorage.removeItem(k));
      renderGallery();
    }
  };
  $("#backdrop").onclick = () => {
    $("#gallery").classList.remove("open");
    setTimeout(() => $("#gallery").hidden = true, 250);
    $("#backdrop").hidden = true;
  };

  // 초기 상태
  toggleNextButtons();
});
