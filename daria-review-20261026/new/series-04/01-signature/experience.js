const gallery=document.querySelector('.gallery-dialog');
if(gallery){
 const files=['interior.png','coast.png','light.png'];
 const labels=['Иллюстративный интерьер — не объект продажи','Другое иллюстративное пространство у моря','Другое иллюстративное пространство с внутренним двором'];
 let index=0,opener;
 const paint=()=>{const img=gallery.querySelector('#gallery-image');img.src='assets/images/'+files[index];img.alt=labels[index];gallery.querySelector('#gallery-caption').textContent=labels[index];gallery.querySelector('[data-gallery-count]').textContent=(index+1)+' / '+files.length};
 document.querySelectorAll('[data-open-gallery]').forEach(b=>b.addEventListener('click',()=>{opener=b;index=Number(b.dataset.openGallery)||0;paint();gallery.showModal()}));
 function move(n){index=(index+n+files.length)%files.length;paint()}
 gallery.querySelector('[data-gallery-prev]').addEventListener('click',()=>move(-1));
 gallery.querySelector('[data-gallery-next]').addEventListener('click',()=>move(1));
 gallery.querySelector('[data-close-gallery]').addEventListener('click',()=>gallery.close());
 gallery.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();move(1)}if(e.key==='ArrowLeft'){e.preventDefault();move(-1)}});
 gallery.addEventListener('click',e=>{if(e.target===gallery)gallery.close()});
 gallery.addEventListener('close',()=>opener?.focus());
 let start;gallery.addEventListener('touchstart',e=>{start=e.changedTouches[0].clientX},{passive:true});
 gallery.addEventListener('touchend',e=>{if(start===undefined)return;const dx=e.changedTouches[0].clientX-start;if(Math.abs(dx)>55)move(dx<0?1:-1);start=undefined},{passive:true});
}
