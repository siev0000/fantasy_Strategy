function installMapControlLayout() {
  if (document.getElementById("v39-map-controls-layout-style")) return;
  const style = document.createElement("style");
  style.id = "v39-map-controls-layout-style";
  style.textContent = `
#v39-map-camera-controls{
  left:auto!important;
  right:max(8px,var(--safe-r,0px))!important;
  bottom:max(8px,var(--safe-b,0px))!important;
  display:flex!important;
  flex-direction:row!important;
  align-items:center!important;
  gap:5px!important;
}
#v39-map-camera-controls button{
  flex:0 0 auto;
}
@media(max-width:700px){
  #v39-map-camera-controls{
    left:auto!important;
    right:max(6px,var(--safe-r,0px))!important;
    bottom:max(6px,var(--safe-b,0px))!important;
  }
}
`;
  document.head.appendChild(style);
}

installMapControlLayout();
