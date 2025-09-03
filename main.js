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
const PAGES = {
  landing: "#pageLanding",
  howto:   "#pageHowto",
  camera:  "#pageCamera",
  select:  "#pageSelect",
  edit:    "#pageEdit"
};
function showPage(name) {
  $$(".page").forEach(el => el.classList.remove("active"));
  const target = $(PAGES[name]);
  if (target) target.classList.add("active");

  const steps = $(".steps");
  const visible = ["camera","select","edit"].includes(name);
  if (steps) steps.style.display = visible ? "flex" : "none";

  $$(".step").forEach(s => s.classList.toggle("active", s.dataset.step === name));

  // 카메라 페이지가 아니면 항상 타이머/카운트다운 종료
  if (name !== "camera") stopAutoCapture();
}

// ---------- QR popup ----------
function forceHideQrPopup(){
  const p = $("#qrPopup");
  if (!p) return;
  p.style.display = "none";
  const box = $("#qrPopupContainer");
  if (box) box.innerHTML = "";
  const l = $("#qrLoading"); if (l) l.style.display = "none";
  const e = $("#qrError");  if (e) { e.style.display = "none"; e.textContent = ""; }
}
function computeQrPopupSize(){ return Math.max(160, Math.floor(Math.min(window.innerWidth * 0.6, 260))); }
function openQrPopup(url){
  const p=$("#qrPopup"), w=$("#qrPopupContainer");
  if (!p || !w) return;
  w.innerHTML="";
  // qrcodejs 전역 객체 사용
  // eslint-disable-next-line no-undef
  new QRCode(w,{text:url,width:computeQrPopupSize(),height:computeQrPopupSize(),correctLevel:QRCode.CorrectLevel.M});
  p.style.display='flex';
}
function closeQrPopup(){
  resetSession();
  const p = $("#qrPopup");
  if (p) p.style.display='none';
  showPage('camera');
}
window.closeQrPopup = closeQrPopup; // inline onclick에서 접근 가능하도록

// ---------- camera ----------
async function startCamera() {
  try {
    if (!("mediaDevices" in navigator)) throw new Error("이 브라우저는 카메라를 지원하지 않습니다.");
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
    video.onloadedmetadata = () => {
      video.play();
      video.classList.toggle("mirror", currentFacing === "user");
    };
    $("#btnShot").disabled = false;
  } catch (e) {
    alert("카메라 접근 실패: " + e.message);
  }
}
function stopCamera() {
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
}

// ---------- capture ----------
function triggerFlash() {
  const f = $("#flash");
  f.classList.add("active");
  setTimeout(() => f.classList.remove("active"), 250);
}
function updateCountdownUI(t) {
  const el = $("#countdown");
  if (!el) return;
  const show = typeof t === "number" ? t > 0 : !!t;
  if (show) { el.textContent = t; el.style.display = "block"; }
  else { el.textContent = ""; el.style.display = "none"; }
}
function stopAutoCapture() {
  autoRunning = false;
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  updateCountdownUI("");
}
async function startAutoCapture() {
  shots = [];
  selected.clear();
  finalDataUrl = null;
  renderThumbs(); renderPreview(); updateCounter(); toggleNextButtons();

  autoRunning = true;
  remain = 6;
  if (autoTimer) clearInterval(autoTimer);

  updateCountdownUI(remain);
  autoTimer = setInterval(() => {
    if (!autoRunning) { clearInterval(autoTimer); autoTimer = null; updateCountdownUI(""); return; }
    remain--;
    updateCountdownUI(remain > 0 ? remain : "");
    if (remain <= 0) {
      remain = 6;
      if (shots.length <= 5) {
        triggerFlash();
        doCapture();
      } else {
        stopAutoCapture();
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
    renderThumbs(); updateCounter(); toggleNextButtons();
  }
}
function updateCounter() { $("#shotCounter").textContent = `${shots.length} / 6`; }

// ---------- select & preview ----------
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
      renderThumbs(); renderPreview(); toggleNextButtons();
      if (selected.size === 4) {
        const sel = $("#frameDesign");
        if (sel && sel.value) applyFrameDesign(sel.value);
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

// ---------- logo inline ----------
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
async function prepareLogosForCapture() { await inlineImageToDataURL($(".fc-logo")); }

// ---------- env ----------
function isMobile(){ return /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent); }

// ---------- compose ----------
async function makeFourcut() {
  if (selected.size !== 4) return alert("4장을 선택하세요");

  const btnMake = $("#btnMake");
  const btnSave = $("#btnSave");

  // 진행 표시
  if (btnMake) { btnMake.disabled = true; btnMake.textContent = "합성 중..."; }

  try {
    // html2canvas 로드 확인
    if (typeof html2canvas !== "function") {
      throw new Error("html2canvas가 로드되지 않았습니다 (네트워크/캐시).");
    }

    // 외부 이미지(CORS) 대비
    await prepareLogosForCapture();

    const node = $("#fourcut");
    if (!node || node.offsetParent === null) {
      throw new Error("미리보기 영역이 보이지 않습니다.");
    }

    // 내부 <img> 모두 로드 대기 (CSS background는 무시됨)
    const imgs = Array.from(node.querySelectorAll("img"));
    await Promise.all(imgs.map(img => img.complete ? 1 : new Promise(r => { img.onload = img.onerror = r; })));

    // 레이아웃 안정화 2프레임
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // 캡처
    const canvas = await html2canvas(node, {
      backgroundColor: null,
      useCORS: true,
      allowTaint: false,
      removeContainer: true,
      imageTimeout: 0,
      scale: isMobile() ? 1.25 : 2,
      // foreignObject 비활성: 일부 모바일에서 에러 예방
      foreignObjectRendering: false
    });

    const quality = isMobile() ? 0.82 : 0.92;
    finalDataUrl = canvas.toDataURL("image/jpeg", quality);

    // ✅ 저장 버튼 확실히 켜기
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.removeAttribute("disabled");
      btnSave.setAttribute("aria-disabled","false");
    }

  } catch (err) {
    console.error(err);
    alert("4컷 만들기 실패: " + err.message);
  } finally {
    if (btnMake) { btnMake.disabled = false; btnMake.textContent = "4컷 만들기"; }
  }
}
// ---------- gallery & save ----------
async function saveImage() {
  if (!finalDataUrl) return;
  const id = Date.now();
  localStorage.setItem("photo:" + id, JSON.stringify({ id, createdAt: Date.now(), image: finalDataUrl }));
  await renderGallery();
  await showQrPopupWithUpload();
}
function resetSession() {
  shots = []; selected.clear(); finalDataUrl = null;
  renderThumbs(); renderPreview(); updateCounter(); $("#btnSave").disabled = true; $("#btnMake").disabled = true;
  toggleNextButtons(); stopAutoCapture();
}
async function renderGallery() {
  const grid = $("#galleryGrid");
  grid.innerHTML = "";
  const items = Object.keys(localStorage)
    .filter(k => k.startsWith("photo:"))
    .map(k => JSON.parse(localStorage.getItem(k)))
    .sort((a, b) => b.createdAt - a.createdAt);
  if (!items.length) {
    grid.innerHTML = "<div style='grid-column:1/-1;text-align:center;color:#999'>저장된 사진 없음</div>";
    return;
  }
  for (const it of items) {
    const wrap = document.createElement("div");
    wrap.className = "g-item";
    wrap.innerHTML = `<img src="${it.image}" alt=""><button class="del">×</button>`;
    wrap.querySelector(".del").onclick = () => { localStorage.removeItem("photo:" + it.id); renderGallery(); };
    grid.appendChild(wrap);
  }
}

// ---------- frames ----------
function applyFrameDesign(key){
  const node = $("#fourcut");
  node.classList.remove("frame1","frame2","frame3");
  if (key) node.classList.add(key);
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
    const e = $("#qrError");
    if (e){ e.style.display = "block"; e.textContent = "QR 생성 실패: " + err.message; }
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
  // 첫 진입
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
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

window.addEventListener("pageshow", forceHideQrPopup);


