let shots = JSON.parse(localStorage.getItem("shots")||"[]");
let selected=new Set();
let finalDataUrl=null;

// 썸네일
function renderThumbs(){
  const grid=document.getElementById("thumbGrid"); grid.innerHTML="";
  shots.forEach((src,idx)=>{
    const d=document.createElement("div");
    d.className="thumb"+(selected.has(idx)?" sel":"");
    const img=document.createElement("img"); img.src=src; d.appendChild(img);
    d.onclick=()=>{
      if(selected.has(idx)) selected.delete(idx);
      else if(selected.size<4) selected.add(idx);
      renderThumbs(); renderPreview();
      document.getElementById("btnMake").disabled=(selected.size!==4);
    };
    grid.appendChild(d);
  });
}

function renderPreview(){
  const grid=document.getElementById("finalGrid"); grid.innerHTML="";
  [...selected].forEach(i=>{
    const cell=document.createElement("div"); cell.className="cell";
    const img=document.createElement("img"); img.src=shots[i];
    cell.appendChild(img); grid.appendChild(cell);
  });
  document.getElementById("polaroidCap").textContent=document.getElementById("caption").value||" ";
}

async function makeFourcut(){
  const node=document.getElementById("fourcut");
  const canvas=await html2canvas(node,{backgroundColor:null,scale:2});
  finalDataUrl=canvas.toDataURL("image/jpeg",0.92);
  document.getElementById("btnSave").disabled=false;
}

async function saveImage(){
  const id=Date.now();
  localStorage.setItem("photo:"+id, JSON.stringify({id,createdAt:id,image:finalDataUrl}));

  // 업로드 + QR
  const publicUrl = await uploadFinalToCloudinary(finalDataUrl);
  const viewerUrl = makeViewerUrl(publicUrl);
  new QRCode(document.getElementById("qr"), { text:viewerUrl, width:200, height:200 });
  document.getElementById("qrBox").hidden=false;
}

renderThumbs();
document.getElementById("caption").oninput=renderPreview;
document.getElementById("btnMake").onclick=makeFourcut;
document.getElementById("btnSave").onclick=saveImage;
