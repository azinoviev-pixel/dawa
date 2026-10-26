(()=>{
  const stage=document.querySelector('.object-stage');
  if(!stage)return;
  const object=stage.querySelector('.object');
  const layers=[...object.querySelectorAll('.layer')];
  const explodeButton=document.querySelector('[data-explode]');
  const resetButton=document.querySelector('[data-reset-view]');
  const rotateButtons=[...document.querySelectorAll('[data-rotate]')];
  const stepButtons=[...document.querySelectorAll('[data-layer]')];
  const localLayers=[...document.querySelectorAll('.local-layer')];
  let rx=-19,ry=31,explode=0,drag=false,lastX=0,lastY=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function render(){object.style.setProperty('--rx',rx+'deg');object.style.setProperty('--ry',ry+'deg');object.style.setProperty('--explode',explode);explodeButton?.classList.toggle('active',explode===1);explodeButton?.setAttribute('aria-pressed',String(explode===1))}
  function reset(){rx=-19;ry=31;explode=0;layers.forEach(x=>x.classList.remove('active'));localLayers.forEach(x=>x.classList.remove('active'));stepButtons.forEach(x=>{x.classList.remove('active');x.setAttribute('aria-pressed','false')});render()}
  stage.addEventListener('pointerdown',e=>{drag=true;lastX=e.clientX;lastY=e.clientY;stage.setPointerCapture(e.pointerId)});
  stage.addEventListener('pointermove',e=>{if(!drag||reduced)return;ry+=(e.clientX-lastX)*.28;rx-=(e.clientY-lastY)*.22;rx=Math.max(-60,Math.min(35,rx));lastX=e.clientX;lastY=e.clientY;render()});
  stage.addEventListener('pointerup',()=>drag=false);stage.addEventListener('pointercancel',()=>drag=false);
  stage.addEventListener('keydown',e=>{const key={ArrowLeft:[0,-8],ArrowRight:[0,8],ArrowUp:[-8,0],ArrowDown:[8,0]}[e.key];if(key){e.preventDefault();rx+=key[0];ry+=key[1];render()}if(e.key.toLowerCase()==='e'){explode=explode?0:1;render()}if(e.key==='Home'){e.preventDefault();reset()}});
  rotateButtons.forEach(button=>button.addEventListener('click',()=>{const [dx,dy]=button.dataset.rotate.split(',').map(Number);rx+=dx;ry+=dy;render()}));
  explodeButton?.addEventListener('click',()=>{explode=explode?0:1;render()});resetButton?.addEventListener('click',reset);
  stepButtons.forEach(button=>button.addEventListener('click',()=>{const i=Number(button.dataset.layer);explode=1;layers.forEach((x,n)=>x.classList.toggle('active',n===i));localLayers.forEach((x,n)=>x.classList.toggle('active',n===i));stepButtons.forEach(x=>{x.classList.toggle('active',x===button);x.setAttribute('aria-pressed',String(x===button))});render()}));
  render();
})();
