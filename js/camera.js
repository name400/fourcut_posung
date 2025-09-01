let stream=null;
let shots=[]; 

async function startCamera(){
  stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
  const video=document.getElementById("video");
  video.srcObject=stream;
}

function doCapture(){
  const video=document.getElementById("video");
  const canvas=document.createElement("canvas");
  canvas.width=video.videoWidth; canvas.height=video.videoHeight;
  canvas.getContext("2d").drawImage(video,0,0);
  shots.push(canvas.toDataURL("image/jpeg",0.9));
  document.getElementById("shotCounter").textContent=`${shots.length} / 6`;
  if(shots.length>=6) document.getElementById("btnNext").disabled=false;
}

document.getElementById("btnShot").onclick=doCapture;
document.getElementById("btnNext").onclick=()=>{
  localStorage.setItem("shots", JSON.stringify(shots));
  location.href="editor.html";
};

startCamera();