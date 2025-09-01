const pass = prompt("갤러리를 열기 위한 암호를 입력하세요:");
if(pass !== "1234"){  // 원하는 암호로 수정
  alert("잘못된 암호입니다.");
  location.href="index.html";
}

const grid=document.getElementById("galleryGrid");
const keys=Object.keys(localStorage).filter(k=>k.startsWith("photo:"));
const items=keys.map(k=>JSON.parse(localStorage.getItem(k)));
items.sort((a,b)=>b.createdAt-a.createdAt);

if(items.length===0){
  grid.innerHTML="<p>저장된 사진 없음</p>";
}else{
  items.forEach(it=>{
    const wrap=document.createElement("div"); wrap.className="g-item";
    const img=document.createElement("img"); img.src=it.image; wrap.appendChild(img);
    grid.appendChild(wrap);
  });
}
