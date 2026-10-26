if(!document.querySelector('meta[name="robots"]')){const robots=document.createElement('meta');robots.name='robots';robots.content='noindex,nofollow';document.head.append(robots)}
const menuButton=document.querySelector('.menu-button');
const mobileMenu=document.querySelector('.mobile-menu');
if(menuButton&&mobileMenu){
  const close=()=>{mobileMenu.hidden=true;menuButton.setAttribute('aria-expanded','false');menuButton.textContent='Меню'};
  menuButton.addEventListener('click',()=>{const open=mobileMenu.hidden;mobileMenu.hidden=!open;menuButton.setAttribute('aria-expanded',String(open));menuButton.textContent=open?'Закрыть':'Меню';if(open)mobileMenu.querySelector('a')?.focus()});
  mobileMenu.addEventListener('click',e=>{if(e.target.closest('a'))close()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!mobileMenu.hidden){close();menuButton.focus()}});
}

const form=document.querySelector('.request-form');
if(form){
  const panels=[...form.querySelectorAll('.step-panel')],bars=[...form.querySelectorAll('.progress span')];
  const next=form.querySelector('[data-next]'),back=form.querySelector('[data-back]'),error=form.querySelector('.error'),label=form.querySelector('[data-step-label]');
  if(!error.id)error.id='request-error';
  const types=[...form.querySelectorAll('[name="type"]')],regions=[...form.querySelectorAll('[name="region"]')];
  const field=name=>form.elements.namedItem(name);let step=0,recoveryPending=false;
  const params=new URLSearchParams(location.search),contextKey=location.pathname+location.search;const property=params.get('property')==='DL-000';
  const aliases={barcelona:'Барселона',brava:'Коста-Брава',blanca:'Коста-Бланка'};
  params.getAll('type').forEach(v=>{const i=types.find(x=>x.value===v);if(i)i.checked=true});
  params.getAll('region').forEach(v=>{const i=regions.find(x=>x.value===(aliases[v]||v));if(i)i.checked=true});
  if(property){document.querySelectorAll('[data-property-context]').forEach(x=>x.hidden=false);const villa=types.find(x=>x.value==='Вилла');if(villa)villa.checked=true}
  const data=()=>({types:types.filter(x=>x.checked).map(x=>x.value),regions:regions.filter(x=>x.checked).map(x=>x.value),regionDiscuss:field('regionDiscuss').checked,min:field('budgetMin').value.trim(),max:field('budgetMax').value.trim(),budgetDiscuss:field('budgetDiscuss').checked,name:field('name').value.trim(),whatsapp:field('whatsapp').value.trim()});
  function sync(){regions.forEach(x=>x.disabled=field('regionDiscuss').checked);field('budgetMin').disabled=field('budgetDiscuss').checked;field('budgetMax').disabled=field('budgetDiscuss').checked}
  // Only non-contact preferences and the current step enter history.state.
  function remember(){const d=data();history.replaceState({...history.state,privateRequest:{key:contextKey,step,types:d.types,regions:d.regions,regionDiscuss:d.regionDiscuss,min:d.min,max:d.max,budgetDiscuss:d.budgetDiscuss}},'')}
  function saved(){const r=history.state?.privateRequest;return r?.key===contextKey?r:null}
  function restore(r){if(!r)return;types.forEach(x=>x.checked=Array.isArray(r.types)&&r.types.includes(x.value));regions.forEach(x=>x.checked=Array.isArray(r.regions)&&r.regions.includes(x.value));field('regionDiscuss').checked=r.regionDiscuss===true;field('budgetDiscuss').checked=r.budgetDiscuss===true;field('budgetMin').value=typeof r.min==='string'?r.min:'';field('budgetMax').value=typeof r.max==='string'?r.max:'';sync()}
  function clear(){error.textContent='';form.querySelectorAll('[aria-invalid=true]').forEach(x=>{x.removeAttribute('aria-invalid');const ids=(x.getAttribute('aria-describedby')||'').split(' ').filter(id=>id&&id!=='request-error');ids.length?x.setAttribute('aria-describedby',ids.join(' ')):x.removeAttribute('aria-describedby')})}
  function issue(n){
    const d=data();
    if(n===0&&!d.types.length)return['Выберите хотя бы один тип объекта. Можно несколько.',types[0]];
    if(n===1){
      if(!d.regionDiscuss&&!d.regions.length)return['Выберите регион или личное обсуждение географии.',regions[0]];
      if(!d.budgetDiscuss){
        if(field('budgetMax').validity.badInput||!d.max||!Number.isFinite(Number(d.max))||Number(d.max)<=0)return['Укажите бюджет «до» больше нуля или выберите личное обсуждение.',field('budgetMax')];
        if(field('budgetMin').validity.badInput||(d.min&&!Number.isFinite(Number(d.min))))return['Укажите нижнюю границу числом или оставьте её пустой.',field('budgetMin')];
        if(Number(d.min)<0)return['Нижняя граница бюджета не может быть отрицательной.',field('budgetMin')];
        if(d.min&&Number(d.min)>Number(d.max))return['Бюджет «до» должен быть не меньше бюджета «от».',field('budgetMax')];
      }
    }
    if(n===2){if(d.name.length<2)return['Укажите имя — минимум два символа.',field('name')];const digits=d.whatsapp.replace(/\D/g,'');if(!/^\+[\d\s()\-]+$/.test(d.whatsapp)||digits.length<8||digits.length>15)return['Укажите WhatsApp с «+», кодом страны и номером: 8–15 цифр.',field('whatsapp')]}
    return null;
  }
  function showError([message,target]){clear();error.textContent=message;target.setAttribute('aria-invalid','true');const ids=target.getAttribute('aria-describedby')||'';target.setAttribute('aria-describedby',(ids+' request-error').trim());target.focus({preventScroll:true})}
  function summary(){const d=data();const fmt=x=>new Intl.NumberFormat('ru-RU').format(Number(x));const budget=d.budgetDiscuss?'Обсудить лично':d.min?`От ${fmt(d.min)} до ${fmt(d.max)} €`:`До ${fmt(d.max)} €`;const rows=[['Тип объекта',d.types.join(', '),0],['Регион',d.regionDiscuss?'Обсудить лично':d.regions.join(', '),1],['Бюджет',budget,1],['Имя',d.name,2],['WhatsApp',d.whatsapp,2]];if(property)rows.unshift(['По примеру','DL-000 · Архитектура тишины. Демонстрационный объект — не предложение продажи.',null]);const dl=form.querySelector('.request-summary');dl.replaceChildren();rows.forEach(([a,b,to])=>{const row=document.createElement('div');row.className='summary-row';const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=a;dd.textContent=b;row.append(dt,dd);if(to!==null){const edit=document.createElement('button');edit.type='button';edit.className='summary-edit';edit.textContent='Изменить';edit.setAttribute('aria-label','Изменить: '+a);edit.onclick=()=>show(to);row.append(edit)}dl.append(row)})}
  function show(n,options={}){step=Math.max(0,Math.min(3,Number(n)||0));panels.forEach((p,i)=>p.hidden=i!==step);bars.forEach((b,i)=>b.classList.toggle('active',i<=step));back.hidden=step===0;next.hidden=step===3;clear();label.textContent=`Шаг ${step+1} из 4 · ${['Пространство','Место и бюджет','Контакт','Проверка'][step]}`;if(step===3)summary();if(options.remember!==false)remember();if(options.focus!==false)panels[step].querySelector('.form-title').focus({preventScroll:true})}
  next.onclick=()=>{const p=issue(step);p?showError(p):show(step+1)};
  back.onclick=()=>show(step-1);
  form.addEventListener('submit',e=>{e.preventDefault();if(step<3)next.click()});
  form.addEventListener('change',()=>{sync();clear();remember()});
  form.addEventListener('input',e=>{clear();if(!['name','whatsapp'].includes(e.target.name))remember()});
  restore(saved());sync();show(0,{remember:false,focus:false});
  window.addEventListener('pageshow',event=>{const nav=performance.getEntriesByType('navigation')[0];const fromHistory=event.persisted||nav?.type==='back_forward';if(fromHistory){recoveryPending=true;setTimeout(()=>{const r=saved();restore(r);let target=Number.isInteger(r?.step)?r.step:0;for(let i=0;i<target;i++){if(issue(i)){target=i;break}}show(target,{focus:false,remember:false});recoveryPending=false},0)}else{if(nav?.type==='reload'){field('name').value='';field('whatsapp').value=''}show(0,{focus:false,remember:false})}});
  window.addEventListener('pagehide',()=>{if(!recoveryPending)remember()});
}
