const CLOUD_NAME = "djqkuxfki";
const UPLOAD_PRESET = "fourcut_unsigned";

async function uploadFinalToCloudinary(dataUrl){
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.append("file", blob);
  form.append("upload_preset", UPLOAD_PRESET);
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  const res = await fetch(endpoint, { method:"POST", body:form });
  const data = await res.json();
  return data.secure_url;
}

function makeViewerUrl(publicUrl){
  const u = new URL("viewer.html", location.href);
  u.searchParams.set("img", publicUrl);
  return u.toString();
}
