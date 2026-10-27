'use strict';
import {SelectionCloud,selectionLoginMessage,CLOUD_KEY,OUTBOX_PREFIX} from './cloud-sync.mjs';
(async () => {
  const $ = (id) => document.getElementById(id);
  const shared = document.body.dataset.mode === 'share';
  const KEY = 'daria-design-review-v1';
  const CLOUD_ORIGIN = 'https://daria-web-preview.up.railway.app';
  let cloud = null, cloudState = null, loginNonce = '', loginLoadTimer;
  let catalog = [], pool = [], votes = {}, current = '', filter = 'all', undo = [], timer, loadTimer, saved = true;
  const toast = (text) => { $('toast').textContent = text; clearTimeout(timer); timer = setTimeout(() => $('toast').textContent = '', 3200); };
  const store = () => {
    if (shared) return;
    try { localStorage.setItem(KEY, JSON.stringify({votes, current})); saved = true; }
    catch { saved = false; }
    $('save-note').textContent = saved ? 'После оценки откроется следующий дизайн. К выбору можно вернуться позже.' : 'Браузер не сохраняет выбор. Скопируйте ссылку на подборку перед закрытием.';
  };
  const eligible = () => pool.filter(x => filter === 'all' || (filter === 'unseen' ? !votes[x.id] : votes[x.id] === filter));
  const label = (x) => x.name + (x.name === x.edition ? '' : ' · ' + x.edition);
  const updateCounts = () => {
    const yes = catalog.filter(x => votes[x.id] === 'yes').length;
    $('liked-count').textContent = yes;
    $('share-open').disabled = !yes;
    $('progress').textContent = `Оценено ${catalog.filter(x => votes[x.id]).length} из ${catalog.length} · Нравятся ${yes}`;
    $('undo').disabled = !undo.length;
  };
  const show = (id, changeHash = true) => {
    const queue = eligible();
    const item = queue.find(x => x.id === id) || queue[0];
    $('empty').hidden = !!item;
    $('preview').hidden = !item;
    $('original').hidden = !item;
    $('yes').disabled = $('no').disabled = !item;
    $('previous').disabled = $('next').disabled = !item;
    updateCounts();
    if (!item) {
      $('loading').hidden = true;
      $('design-name').textContent = shared ? 'Подборка для Дарьи' : 'Нет вариантов в этом списке';
      $('edition').textContent = '';
      $('position').textContent = '0 из 0';
      if (shared) $('empty-text').textContent = 'Попросите прислать полную ссылку на выбранные варианты.';
      return;
    }
    current = item.id;
    const index = queue.findIndex(x => x.id === current);
    $('design-name').textContent = item.name;
    $('edition').textContent = shared ? 'Дарья Лемис · варианты оформления сайта' : item.edition + (item.intermediate ? ' · промежуточная версия' : '');
    $('position').textContent = `${index + 1} из ${queue.length}`;
    $('previous').disabled = index === 0;
    $('next').disabled = index === queue.length - 1;
    $('yes').setAttribute('aria-pressed', votes[current] === 'yes');
    $('no').setAttribute('aria-pressed', votes[current] === 'no');
    $('original').href = item.url;
    $('preview').title = 'Дизайн: ' + label(item);
    if ($('preview').getAttribute('src') !== item.url) {
      $('loading').textContent = 'Загружаем дизайн…';
      $('loading').hidden = false;
      clearTimeout(loadTimer);
      $('preview').src = item.url;
      loadTimer = setTimeout(() => { $('loading').textContent = 'Загрузка занимает больше времени. Можно открыть дизайн отдельно.'; }, 16000);
    }
    if (changeHash && !shared) history.replaceState(null, '', '#' + current);
    store();
  };
  const move = (step) => { const queue = eligible(); const index = queue.findIndex(x => x.id === current); if (queue[index + step]) show(queue[index + step].id); };
  const vote = (value) => {
    const queue = eligible();
    const index = queue.findIndex(x => x.id === current);
    if (index < 0) return;
    const previous = votes[current];
    undo.push({id:current, previous, filter});
    votes[current] = value;
    store();
    cloud?.mark(current,value);
    const next = queue[index + 1];
    show(next ? next.id : current);
    toast((value === 'yes' ? 'Добавлено в понравившиеся' : 'Отмечено: не нравится') + (!next ? '. Вы дошли до конца списка.' : ''));
  };
  const renderList = () => {
    const term = $('search').value.trim().toLocaleLowerCase('ru');
    const rows = eligible().filter(x => [x.name,x.edition,x.group].join(' ').toLocaleLowerCase('ru').includes(term));
    $('list-count').textContent = `${rows.length} из ${pool.length} вариантов`;
    $('design-list').replaceChildren();
    for (const item of rows) {
      const row = document.createElement('button'); row.className = 'design-row'; row.setAttribute('aria-current', item.id === current);
      const number = document.createElement('span'); number.className = 'row-number'; number.textContent = pool.indexOf(item) + 1;
      const text = document.createElement('span');
      const name = document.createElement('span'); name.className = 'row-name'; name.textContent = item.name;
      const detail = document.createElement('span'); detail.className = 'row-detail'; detail.textContent = shared ? `Вариант ${pool.indexOf(item) + 1}` : `${item.edition} · ${item.group}`;
      text.append(name, detail);
      const status = document.createElement('span'); status.className = 'row-status ' + (votes[item.id] || '');
      status.textContent = shared ? 'Открыть' : votes[item.id] === 'yes' ? 'Нравится' : votes[item.id] === 'no' ? 'Не нравится' : 'Без оценки';
      row.append(number,text,status); row.addEventListener('click', () => { show(item.id); $('list-dialog').close(); });
      $('design-list').append(row);
    }
    if (!rows.length) $('design-list').textContent = 'Ничего не найдено. Попробуйте другой фильтр или название.';
  };
  const openList = (selectedFilter) => { filter = selectedFilter; $('filter').value = filter; $('search').value = ''; renderList(); $('list-dialog').showModal(); };
  $('preview').addEventListener('load', () => {
    clearTimeout(loadTimer); $('loading').hidden = true;
    try {
      const doc = $('preview').contentDocument;
      const style = doc.createElement('style');
      style.textContent = '.design-switcher,.studio-switcher{display:none!important}:root{--switcher-height:0px!important}';
      doc.head.append(style);
      // Legacy themes also switch on arrow keys. Keep the visible design and its rating together.
      doc.addEventListener('keydown', event => {
        if (!doc.querySelector('.design-switcher,.studio-switcher') || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
        event.stopImmediatePropagation();
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.target.closest('input,textarea,select,[contenteditable=true]')) return;
        event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1);
      }, true);
    } catch {}
  });
  $('previous').addEventListener('click', () => move(-1));
  $('next').addEventListener('click', () => move(1));
  $('yes').addEventListener('click', () => vote('yes'));
  $('no').addEventListener('click', () => vote('no'));
  $('undo').addEventListener('click', () => { const last = undo.pop(); if (!last) return; if (last.previous) votes[last.id] = last.previous; else delete votes[last.id]; cloud?.mark(last.id,last.previous); filter = last.filter; show(last.id); toast('Последняя оценка отменена'); });
  $('list-open').addEventListener('click', () => openList('all'));
  $('liked-open').addEventListener('click', () => openList('yes'));
  $('show-all').addEventListener('click', () => { filter = 'all'; show(current); });
  $('search').addEventListener('input', renderList);
  $('filter').addEventListener('change', () => { filter = $('filter').value; renderList(); });
  $('list-dialog').addEventListener('close', () => show(current));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  $('share-open').addEventListener('click', () => {
    const ids = catalog.filter(x => votes[x.id] === 'yes').map(x => x.id);
    if (!ids.length) return;
    const url = new URL('/daria-selected/', location.origin); url.hash = 'v1=' + ids.join('.');
    $('share-url').value = url.href; $('share-preview').href = url.href;
    $('share-count').textContent = `Выбрано вариантов: ${ids.length}`;
    $('copy').textContent = 'Скопировать ссылку'; $('share-dialog').showModal();
  });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('share-url').value); $('copy').textContent = 'Ссылка скопирована'; }
    catch { $('share-url').focus(); $('share-url').select(); $('copy').textContent = 'Выделено — скопируйте ссылку'; }
  });
  window.addEventListener('hashchange', () => { if (!shared) show(location.hash.slice(1), false); });
  window.addEventListener('storage', (event) => {
    if (!shared && cloud && (event.key===CLOUD_KEY || event.key?.startsWith(OUTBOX_PREFIX))) {
      if (document.visibilityState==='visible') cloud.sync();
      return;
    }
    if (shared || event.key !== KEY) return;
    if (cloud?.connection()) return;
    try { const data = JSON.parse(event.newValue); if (!data || typeof data.votes !== 'object') return; votes = Object.fromEntries(catalog.filter(x => ['yes','no'].includes(data.votes[x.id])).map(x => [x.id,data.votes[x.id]])); updateCounts(); $('yes').setAttribute('aria-pressed',votes[current] === 'yes'); $('no').setAttribute('aria-pressed',votes[current] === 'no'); if ($('list-dialog').open) renderList(); } catch {}
  });
  const ratingText = selected => selected === 'yes' ? 'Нравится' : selected === 'no' ? 'Не нравится' : 'Без оценки';
  const renderConflicts = () => {
    $('conflict-list').replaceChildren();
    for (const conflict of cloudState?.conflicts || []) {
      const design=catalog.find(x=>x.id===conflict.id); if (!design) continue;
      const row=document.createElement('section'); row.className='conflict-row';
      const heading=document.createElement('h3'); heading.textContent=label(design);
      const detail=document.createElement('p'); detail.textContent=`Здесь: ${ratingText(conflict.local)}. На сайте: ${ratingText(conflict.remote)}.`;
      const actions=document.createElement('div'); actions.className='share-actions';
      for (const [title,useLocal] of [['Оставить мой выбор',true],['Взять с сайта',false]]) {
        const button=document.createElement('button'); button.textContent=title;
        button.addEventListener('click',async()=>{button.disabled=true; await cloud.resolve(conflict.id,useLocal); renderConflicts();});
        actions.append(button);
      }
      row.append(heading,detail,actions); $('conflict-list').append(row);
    }
    if (!cloudState?.conflicts.length) $('conflict-list').textContent='Все расхождения разобраны.';
  };
  const onCloudStatus = state => {
    cloudState=state;
    $('cloud-status').textContent=state.message;
    $('cloud-bar').dataset.status=state.phase;
    $('cloud-connect').textContent=state.phase==='auth' ? 'Войти снова' : ['offline','storage'].includes(state.phase) || (state.pendingCount && state.phase!=='conflict') ? 'Повторить' : cloud?.connected() ? 'Обновить' : 'Сохранить на сайте';
    $('cloud-connect').disabled=state.phase==='connecting';
    $('cloud-conflicts').hidden=!state.conflicts.length;
    if (state.conflicts.length) $('cloud-conflicts').textContent=`Сравнить оценки (${state.conflicts.length})`;
    if ($('conflict-dialog').open) renderConflicts();
  };
  $('cloud-conflicts').addEventListener('click',()=>{renderConflicts();$('conflict-dialog').showModal();});
  $('cloud-connect').addEventListener('click',()=>{
    if (shared || !cloud) return;
    if (cloud.connected() && cloudState?.phase!=='auth') { cloud.sync(); return; }
    loginNonce=crypto.randomUUID()+crypto.randomUUID();
    const count=Object.values(votes).filter(x=>x==='yes').length;
    $('cloud-login-summary').textContent=`В этом браузере отмечено «Нравится»: ${count}. После входа этот выбор станет доступен с других устройств.`;
    $('cloud-login-loading').textContent='Загружаем форму входа…';
    $('cloud-login-loading').hidden=false;
    $('cloud-login-frame').src=CLOUD_ORIGIN+'/design-selection/login/?state='+encodeURIComponent(loginNonce);
    $('cloud-login-dialog').showModal();
    clearTimeout(loginLoadTimer);
    loginLoadTimer=setTimeout(()=>{
      $('cloud-login-loading').textContent='Форма загружается дольше обычного. Можно закрыть окно и попробовать ещё раз. Ваши отметки сохранены.';
    },15000);
  });
  $('cloud-login-frame').addEventListener('load',()=>{
    if (!loginNonce) return;
    clearTimeout(loginLoadTimer);
    $('cloud-login-loading').hidden=true;
  });
  const clearLogin=()=>{
    loginNonce=''; clearTimeout(loginLoadTimer);
    $('cloud-login-frame').src='about:blank';
  };
  window.addEventListener('message',async event=>{
    if (shared || !cloud || !$('cloud-login-dialog').open) return;
    const access=selectionLoginMessage(event,{origin:CLOUD_ORIGIN,source:$('cloud-login-frame').contentWindow,nonce:loginNonce});
    if (!access) return;
    // Invalidate this one-time handshake before the asynchronous save starts.
    clearLogin(); $('cloud-login-dialog').close();
    try {
      await cloud.connect(access.token,access.expiresAt);
    } catch {
      cloud.emit('auth','Подключение не завершено. Ваши отметки остаются в этом браузере.');
    }
  });
  $('cloud-login-dialog').addEventListener('close',clearLogin);
  window.addEventListener('pagehide',clearLogin);
  try {
    const response = await fetch('/daria-select/catalog.json'); if (!response.ok) throw Error('catalog'); catalog = await response.json();
    pool = catalog;
    if (shared) {
      const ids = new URLSearchParams(location.hash.slice(1)).get('v1')?.split('.') || [];
      pool = ids.filter((id,i) => ids.indexOf(id) === i).map(id => catalog.find(x => x.id === id)).filter(Boolean);
      $('heading').textContent = 'Подборка для Дарьи'; $('list-open').firstChild.textContent = 'Варианты ';
    } else {
      try { const data = JSON.parse(localStorage.getItem(KEY) || '{}'); current = data.current || ''; votes = Object.fromEntries(catalog.filter(x => ['yes','no'].includes(data.votes?.[x.id])).map(x => [x.id,data.votes[x.id]])); } catch {}
    }
    $('total').textContent = pool.length;
    show(!shared && location.hash ? location.hash.slice(1) : current);
    if (!shared) {
      let storage;
      try { storage=localStorage; } catch { storage={length:0,key:()=>null,getItem:()=>null,setItem:()=>{throw Error('storage');},removeItem:()=>{}}; }
      cloud=new SelectionCloud({ids:catalog.map(x=>x.id),storage,backend:CLOUD_ORIGIN,locks:navigator.locks,
        getLocalVotes:()=>votes,onStatus:onCloudStatus,onVotes:next=>{votes=next;show(current);if($('list-dialog').open)renderList();}});
      cloud.sync();
      const refresh=()=>{if(document.visibilityState==='visible' && cloud.connection())cloud.sync();};
      window.addEventListener('focus',refresh); window.addEventListener('online',refresh);
      document.addEventListener('visibilitychange',refresh);
    }
  } catch {
    $('loading').textContent = 'Не удалось загрузить список. Обновите страницу или откройте прежнюю галерею.';
    $('design-name').textContent = 'Список временно недоступен';
  }
})();
