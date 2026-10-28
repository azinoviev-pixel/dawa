import {SelectionCloud,CLOUD_KEY,OUTBOX_PREFIX} from './cloud-sync.mjs?v=grouped-r2';
import {LOCAL_KEY,BACKEND,readLocal,makeLogin,consumeCallback,cleanVotes} from './review-state.mjs?v=grouped-r2';

import {buildGroups,filterGroups,resolveChoice,stepGroup,rateChoice,undoChoice} from './grouped-review.mjs?v=grouped-r2';

const $=id=>document.getElementById(id);
// The short-lived callback code must never stay in a copied page address.
const callbackHash=location.hash;
if(new URLSearchParams(callbackHash.slice(1)).has('connect')) history.replaceState(null,'',location.pathname+location.search);
let storage,persistent=true;
try{storage=window.localStorage;}catch{
  persistent=false;const memory=new Map();
  storage={get length(){return memory.size},key:i=>[...memory.keys()][i]??null,getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
}
let catalog=[],groups=[],ids=[],votes={},current='',view='designs',filter='all',undo=[],cloud=null,cloudState=null,storageFailed=!persistent;
let toastTimer,loadTimer;
const ratingLabel=value=>value==='yes'?'Нравится':value==='no'?'Не нравится':'Без оценки';
const toast=text=>{$('toast').textContent=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').textContent='',3800);};
const queue=()=>filterGroups(groups,votes,filter);
const variantName=item=>item.variantLabel==='Основной'?item.groupName:`${item.groupName} · ${item.variantLabel}`;

function drawCloud(){
  const state=cloudState;
  $('save-line').dataset.status=storageFailed?'storage':state?.phase||'local';
  if(storageFailed){
    $('cloud-status').textContent='Браузер не сохраняет отметки. Не закрывайте страницу; разрешите хранение данных для этого сайта.';
  }else if(state?.phase==='local'||!state){
    $('cloud-status').textContent=Object.keys(votes).length?'Ваш выбор сохранён в этом браузере. Подключите сайт для доступа с других устройств.':'Отметьте то, что вам нравится. После оценки откроется следующее направление.';
  }else $('cloud-status').textContent=state.message;
  $('cloud-connect').textContent=state?.phase==='saved'?'Обновить':state?.phase==='offline'?'Повторить':state?.phase==='syncing'?'Сохраняем…':'Сохранить на сайте';
  $('cloud-connect').disabled=state?.phase==='syncing';
  $('cloud-conflicts').hidden=!state?.conflicts?.length;
}

function store(){
  try{storage.setItem(LOCAL_KEY,JSON.stringify({votes,current,view}));storageFailed=!persistent;}
  catch{storageFailed=true;}
  drawCloud();
}
function counts(){
  const rated=catalog.filter(item=>votes[item.id]).length;
  $('liked-count').textContent=catalog.filter(item=>votes[item.id]==='yes').length;
  $('progress').textContent=`Оценено версий: ${rated} из ${catalog.length}`;
  $('undo').disabled=!undo.length;
}
function drawVariants(item){
  const group=groups.find(group=>group.id===item.groupId);
  const visible=queue().find(group=>group.id===item.groupId);
  const options=$('variant-options');options.replaceChildren();options.hidden=group.items.length<2;
  $('version-caption').textContent=group.items.length>1?`Открыта версия: ${item.variantLabel}`:'Один вариант в этом направлении';
  for(const variant of visible?.items||[]){
    const button=document.createElement('button');button.className='variant-button';
    button.setAttribute('aria-pressed',variant.id===current);button.dataset.rating=votes[variant.id]||'';
    const label=document.createElement('span');label.textContent=variant.variantLabel;
    button.append(label);
    if(votes[variant.id]){const status=document.createElement('span');status.className='variant-rating';status.textContent=ratingLabel(votes[variant.id]);button.append(status);}
    button.setAttribute('aria-label',`${variant.variantLabel}: ${ratingLabel(votes[variant.id])}`);
    button.addEventListener('click',()=>show(variant.id));options.append(button);
  }
}
function show(id,writeHash=true,persist=true){
  const list=queue(),item=resolveChoice(groups,votes,filter,id);
  counts();
  $('empty').hidden=!!item;$('preview').hidden=!item;$('original').hidden=!item;
  $('yes').disabled=$('no').disabled=!item;
  if(!item){
    $('loading').hidden=true;$('position').textContent='0 / 0';
    $('design-name').textContent=filter==='yes'?'Понравившиеся':'Все варианты оценены';
    $('design-description').textContent='Вернитесь ко всем направлениям';
    $('empty-title').textContent=filter==='yes'?'Здесь появятся понравившиеся дизайны':'Вы посмотрели все варианты';
    $('variant-options').replaceChildren();$('version-caption').textContent='';
    $('previous').disabled=$('next').disabled=true;
    $('yes').setAttribute('aria-pressed','false');$('no').setAttribute('aria-pressed','false');
    if(persist)store();return;
  }
  current=item.id;
  const index=list.findIndex(group=>group.id===item.groupId);
  $('design-name').textContent=item.groupName;$('design-description').textContent=item.groupDescription;
  $('position').textContent=`${index+1} / ${list.length}`;
  $('position').setAttribute('aria-label',`Направление ${index+1} из ${list.length}`);
  $('previous').disabled=index===0;$('next').disabled=index===list.length-1;
  $('yes').setAttribute('aria-pressed',votes[current]==='yes');
  $('no').setAttribute('aria-pressed',votes[current]==='no');
  $('original').href=item.url;$('preview').title=`Дизайн «${variantName(item)}»`;
  drawVariants(item);
  if($('preview').getAttribute('src')!==item.url){
    $('loading').textContent='Загружаем дизайн…';$('loading').hidden=false;clearTimeout(loadTimer);
    $('preview').src=item.url;
    loadTimer=setTimeout(()=>{$('loading').textContent='Дизайн загружается дольше обычного. Его можно открыть отдельно.';},16000);
  }
  if(writeHash&&view==='designs')history.replaceState(null,'','#'+current);
  if(persist)store();
}
function move(step){const item=stepGroup(groups,votes,filter,current,step);if(item)show(item.id);}
function setView(next,focus=false){
  view=next==='site'?'site':'designs';
  for(const name of ['designs','site']){
    const active=view===name;
    $(name+'-panel').hidden=!active;$(name+'-tab').setAttribute('aria-selected',active);$(name+'-tab').tabIndex=active?0:-1;
  }
  history.replaceState(null,'',view==='site'?'#site':'#'+current);
  if(focus)$(view+'-tab').focus();
  store();
}
function vote(value){
  const choice=rateChoice(groups,{votes,current,filter},value);if(!choice)return;
  const id=current;undo.push(choice.undo);votes=choice.votes;store();cloud?.mark(id,value);
  show(choice.nextId);
  toast((value==='yes'?'Версия добавлена в понравившиеся':'Версия отмечена: не нравится')+(choice.atEnd?'. Это последнее направление в списке.':''));
}
function renderList(){
  $('list-heading').textContent=filter==='yes'?'Понравившиеся версии':filter==='unseen'?'Ещё не оценены':'Все направления';
  document.querySelectorAll('[data-filter]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.filter===filter));
  const items=queue();$('design-list').replaceChildren();$('list-empty').hidden=!!items.length;
  $('list-summary').textContent=`Направления: ${items.length} · версии: ${items.reduce((sum,group)=>sum+group.items.length,0)}`;
  for(const group of items){
    const section=document.createElement('section');section.className='list-group';
    const heading=document.createElement('div');heading.className='group-heading';
    const number=document.createElement('span');number.className='row-number';number.textContent=String(groups.findIndex(item=>item.id===group.id)+1).padStart(2,'0');
    const text=document.createElement('div'),name=document.createElement('h3'),detail=document.createElement('p');
    name.textContent=group.name;detail.textContent=group.description;text.append(name,detail);heading.append(number,text);section.append(heading);
    for(const item of group.items){
      const row=document.createElement('button');row.className='design-row';row.setAttribute('aria-current',item.id===current?'true':'false');
      const label=document.createElement('span');label.className='row-name';label.textContent=item.variantLabel==='Основной'?'Открыть направление':item.variantLabel;
      const status=document.createElement('span');status.className='row-status '+(votes[item.id]||'');status.textContent=ratingLabel(votes[item.id]);
      row.setAttribute('aria-label',`${group.name} · ${item.variantLabel}: ${ratingLabel(votes[item.id])}`);
      row.append(label,status);row.addEventListener('click',()=>{show(item.id);$('list-dialog').close();});section.append(row);
    }
    $('design-list').append(section);
  }
}
function openList(nextFilter){filter=nextFilter;renderList();$('list-dialog').showModal();}
function renderConflicts(){
  $('conflict-list').replaceChildren();
  for(const conflict of cloud?.conflicts||[]){
    const item=catalog.find(item=>item.id===conflict.id);if(!item)continue;
    const row=document.createElement('section');row.className='conflict-row';
    const title=document.createElement('h3');title.textContent=variantName(item);
    const description=document.createElement('p');description.textContent=`Здесь: ${ratingLabel(conflict.local)}. На сайте: ${ratingLabel(conflict.remote)}.`;
    const actions=document.createElement('div');actions.className='conflict-actions';
    for(const [label,useLocal]of [['Оставить мою оценку',true],['Взять оценку с сайта',false]]){
      const button=document.createElement('button');button.textContent=label;
      button.addEventListener('click',async()=>{button.disabled=true;await cloud.resolve(item.id,useLocal);renderConflicts();if(!cloud.conflicts.length)$('conflict-dialog').close();});actions.append(button);
    }
    row.append(title,description,actions);$('conflict-list').append(row);
  }
}

$('previous').addEventListener('click',()=>move(-1));$('next').addEventListener('click',()=>move(1));
$('yes').addEventListener('click',()=>vote('yes'));$('no').addEventListener('click',()=>vote('no'));
$('undo').addEventListener('click',()=>{const last=undo.pop();if(!last)return;const restored=undoChoice(votes,last);votes=restored.votes;filter=restored.filter;store();cloud?.mark(last.id,last.previous);show(restored.current);toast('Последняя оценка отменена');});
$('list-open').addEventListener('click',()=>openList('all'));$('liked-open').addEventListener('click',()=>openList('yes'));
$('show-all').addEventListener('click',()=>{filter='all';show(current);});
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;renderList();}));
$('list-dialog').addEventListener('close',()=>show(current));
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
$('cloud-conflicts').addEventListener('click',()=>{renderConflicts();$('conflict-dialog').showModal();});
for(const name of ['designs','site'])$(name+'-tab').addEventListener('click',()=>setView(name));
$('back-to-designs').addEventListener('click',()=>setView('designs',true));
document.querySelector('.wordmark').addEventListener('click',event=>{event.preventDefault();setView('designs');});
document.querySelector('.view-tabs').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setView(event.key==='Home'?'designs':event.key==='End'?'site':view==='site'?'designs':'site',true);}});
window.addEventListener('keydown',event=>{
  if(view!=='designs'||document.querySelector('dialog[open]')||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.target.closest('input,textarea,select,button,a,[contenteditable=true]'))return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}
});
window.addEventListener('hashchange',()=>{
  if(location.hash==='#site'){setView('site');return;}
  const id=location.hash.slice(1);if(ids.includes(id)){current=id;view='designs';filter='all';setView('designs');show(id,false);}
});
$('preview').addEventListener('load',()=>{
  clearTimeout(loadTimer);$('loading').hidden=true;
  try{
    const doc=$('preview').contentDocument;
    if(!doc?.head)return;
    const style=doc.createElement('style');style.textContent='.design-switcher,.studio-switcher{display:none!important}:root{--switcher-height:0px!important}';doc.head.append(style);
    doc.addEventListener('keydown',event=>{
      if(!doc.querySelector('.design-switcher,.studio-switcher')||!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.stopImmediatePropagation();
      if(event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.target.closest('input,textarea,select,[contenteditable=true]'))return;
      event.preventDefault();move(event.key==='ArrowRight'?1:-1);
    },true);
  }catch{}
});
$('cloud-connect').addEventListener('click',()=>{
  if(cloud?.connected()&&cloudState?.phase!=='auth'){cloud.sync();return;}
  store();if(storageFailed){toast('Сначала разрешите браузеру сохранять данные, чтобы отметки не потерялись при входе.');return;}
  try{const destination=makeLogin(sessionStorage,current,crypto.randomUUID()+crypto.randomUUID());location.assign(destination);}
  catch(error){toast(error.message);}
});
window.addEventListener('online',()=>cloud?.connection()&&cloud.sync());
window.addEventListener('focus',()=>cloud?.connection()&&cloud.sync());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&cloud?.connection())cloud.sync();});
window.addEventListener('storage',event=>{
  if(event.key===CLOUD_KEY||event.key?.startsWith(OUTBOX_PREFIX)){if(document.visibilityState==='visible')cloud?.sync();return;}
  if(event.key!==LOCAL_KEY||cloud?.connection())return;
  try{votes=cleanVotes(JSON.parse(event.newValue)?.votes,ids);show(current,true,false);drawCloud();}catch{}
});

async function init(){
  const response=await fetch('./catalog.json?v=grouped-r2',{cache:'no-store'});if(!response.ok)throw Error('Не удалось загрузить список дизайнов. Обновите страницу.');
  catalog=await response.json();
  groups=buildGroups(catalog);
  document.querySelectorAll('[data-group-count]').forEach(element=>element.textContent=groups.length);
  ids=catalog.map(item=>item.id);const local=readLocal(storage,ids),linkedDesign=ids.includes(location.hash.slice(1));votes=local.votes;current=linkedDesign?location.hash.slice(1):local.current;view=location.hash==='#site'?'site':linkedDesign?'designs':local.view;
  cloud=new SelectionCloud({ids,storage,backend:BACKEND,locks:navigator.locks,getLocalVotes:()=>votes,onVotes:next=>{votes=next;show(current);if($('list-dialog').open)renderList();},onStatus:state=>{cloudState=state;drawCloud();}});
  setView(view);show(current);
  if(new URLSearchParams(callbackHash.slice(1)).has('connect')){
    try{
      const callback=consumeCallback(callbackHash,sessionStorage,ids);current=callback.current;view='designs';setView('designs');show(current);
      cloudState={phase:'syncing',message:'Подключаем сохранение вашего выбора…'};drawCloud();
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
      let exchange;
      try{exchange=await fetch(BACKEND+'/api/daria-review/exchange',{method:'POST',credentials:'omit',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({code:callback.code,state:callback.state})});}
      finally{clearTimeout(timeout);}
      const data=await exchange.json();if(!exchange.ok)throw Error(data.error||'Не удалось завершить вход. Войдите ещё раз; оценки сохранены в браузере.');
      await cloud.connect(data.token,data.expiresAt);
    }catch(error){cloudState={phase:'auth',message:'Вход не завершён. Ваши оценки сохранены в браузере; войдите ещё раз.'};drawCloud();toast(error.message);}
  }else if(cloud.connection())await cloud.sync();
}
init().catch(error=>{$('loading').textContent=error.message;$('loading').hidden=false;$('yes').disabled=$('no').disabled=$('previous').disabled=$('next').disabled=true;toast(error.message);});
