// Only design ratings use this scoped token. CMS cookies and shared links never carry it.
export const CLOUD_KEY = 'daria-design-review-cloud-v1';
export const CACHE_KEY = 'daria-design-review-cloud-cache-v1';
export const OUTBOX_PREFIX = 'daria-design-review-outbox-v1:';
export const FLIGHT_KEY = 'daria-design-review-flight-v1';
export const BACKUP_KEY = 'daria-design-review-before-cloud-v1';
const value = x => x === 'yes' || x === 'no' ? x : null;

export function selectionLoginMessage(event,{origin,source,nonce,now=Date.now()}) {
  if (!source || !nonce || event.origin!==origin || event.source!==source) return null;
  const data=event.data;
  if (!data || data.type!=='daria-selection-connected' || data.state!==nonce) return null;
  if (typeof data.token!=='string' || data.token.length<24 || data.token.length>256 || !Number.isFinite(data.expiresAt) || data.expiresAt<=now) return null;
  return {token:data.token,expiresAt:data.expiresAt};
}

export class SelectionCloud {
  constructor({ids, storage, fetcher = (...args) => globalThis.fetch(...args), backend, getLocalVotes, onVotes, onStatus,
    now = () => Date.now(), uuid = () => crypto.randomUUID(), locks = null}) {
    Object.assign(this, {storage, fetcher, backend, getLocalVotes, onVotes, onStatus, now, uuid, locks});
    this.ids = new Set(ids);
    this.server = this.validState(this.read(CACHE_KEY)) || {revision:0,votes:{},updatedAt:null};
    this.running = null;
    this.conflicts = [];
    this.phase = 'local';
    this.storageFailed = false;
  }
  read(key) { try { return JSON.parse(this.storage.getItem(key) || 'null'); } catch { return null; } }
  write(key, data) {
    try { this.storage.setItem(key, JSON.stringify(data)); return true; }
    catch { this.storageFailed = true; return false; }
  }
  cleanVotes(input) { return Object.fromEntries(Object.entries(input || {}).filter(([id,v]) => this.ids.has(id) && value(v))); }
  validState(input) {
    if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0 || !input.votes || typeof input.votes !== 'object') return null;
    return {revision:input.revision,votes:this.cleanVotes(input.votes),updatedAt:input.updatedAt || null};
  }
  connection() { return this.read(CLOUD_KEY); }
  connected() { const c=this.connection(); return !!(c?.token && c.expiresAt > this.now()); }
  pending() {
    const result=[];
    try {
      for (let i=0;i<this.storage.length;i++) {
        const key=this.storage.key(i); if (!key?.startsWith(OUTBOX_PREFIX)) continue;
        const item=this.read(key);
        if (item && this.ids.has(item.id) && ['yes','no',null].includes(item.value) && ['yes','no',null].includes(item.base) && Number.isFinite(item.at)) result.push({...item,key});
      }
    } catch { this.storageFailed=true; }
    return result.sort((a,b)=>a.at-b.at || a.key.localeCompare(b.key));
  }
  latest(items=this.pending()) { const map=new Map(); items.forEach(x=>map.set(x.id,x)); return [...map.values()]; }
  combined() {
    const result={...this.server.votes};
    for (const item of this.latest()) { if (item.value) result[item.id]=item.value; else delete result[item.id]; }
    return result;
  }
  emit(phase, message) {
    this.phase=phase;
    this.onStatus({phase,message,pendingCount:this.latest().length,conflicts:this.conflicts,
      serverCount:Object.values(this.server.votes).filter(x=>x==='yes').length,updatedAt:this.server.updatedAt,
      storageFailed:this.storageFailed});
  }
  display() { this.onVotes(this.combined()); }
  acceptState(input) {
    const state=this.validState(input); if (!state) throw Error('Некорректный ответ сервера');
    // A replayed idempotent response may be older than our current GET.
    if (state.revision >= this.server.revision) this.server=state;
    this.write(CACHE_KEY,this.server);
  }
  acknowledge(items) { for (const item of items) { try { this.storage.removeItem(item.key); } catch { this.storageFailed=true; } } }
  mark(id, selected) {
    if (!this.ids.has(id) || !this.connection()) return;
    const item={id,value:value(selected),base:value(this.server.votes[id]),at:this.now()};
    if (!this.write(OUTBOX_PREFIX+this.uuid(),item)) {
      this.emit('storage','Браузер не сохраняет изменения. Скопируйте ссылку на подборку, прежде чем закрывать страницу.'); return;
    }
    this.emit('syncing','Сохраняем выбор на сайте…');
    this.sync();
  }
  async connect(token, expiresAt) {
    if (typeof token!=='string' || token.length<24 || token.length>256 || !Number.isFinite(expiresAt) || expiresAt<=this.now()) throw Error('Некорректное подключение');
    const previous=this.connection();
    if (!this.read(BACKUP_KEY)) this.write(BACKUP_KEY,{votes:this.cleanVotes(this.getLocalVotes()),savedAt:new Date(this.now()).toISOString()});
    if (!this.write(CLOUD_KEY,{token,expiresAt,imported:!!previous?.imported})) {
      this.emit('storage','Не удалось сохранить подключение в браузере. Ваши отметки остаются на этой странице.'); return;
    }
    return this.sync();
  }
  async request(method='GET',body) {
    const c=this.connection();
    if (!c?.token || c.expiresAt<=this.now()) { const error=Error('Войдите ещё раз, чтобы продолжить сохранение на сайте.'); error.status=401; throw error; }
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const response=await this.fetcher(this.backend+'/api/design-selection',{
        method,credentials:'omit',cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+c.token,...(body?{'Content-Type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{})
      });
      let data; try { data=await response.json(); } catch { throw Error('Сервер пока не ответил. Ваши отметки сохранены в браузере.'); }
      if (!response.ok) { const error=Error(data.error || 'Сохранение пока недоступно'); error.status=response.status; error.state=data.state; throw error; }
      return data;
    } finally { clearTimeout(timeout); }
  }
  async execute(flight) {
    // Persist the exact request before sending: a retry cannot create a second mutation.
    if (!this.write(FLIGHT_KEY,flight)) throw Error('Не удалось сохранить очередь изменений в браузере');
    const state=await this.request('POST',flight.body);
    this.acceptState(state);
    if (flight.body.mode==='importMissing') {
      const c=this.connection(); this.write(CLOUD_KEY,{...c,imported:true});
      // Edits made while the first import was in flight build on that import.
      for (const pending of this.pending()) {
        if (flight.body.changes[pending.id] && !flight.before[pending.id] && pending.base===null) {
          this.write(pending.key,{...pending,base:flight.body.changes[pending.id]});
        }
      }
    } else {
      const included=new Set(flight.keys);
      for (const pending of this.pending()) {
        if (!included.has(pending.key) && Object.hasOwn(flight.body.changes,pending.id) && pending.base===value(flight.before[pending.id])) {
          this.write(pending.key,{...pending,base:value(flight.body.changes[pending.id])});
        }
      }
      this.acknowledge(flight.keys.map(key=>({key})));
    }
    try { this.storage.removeItem(FLIGHT_KEY); } catch { this.storageFailed=true; }
    return state;
  }
  async run() {
    if (!this.connection()) { this.emit('local','Сохранено в этом браузере. Подключите сайт, чтобы выбор был доступен с других устройств.'); return; }
    this.emit('syncing','Сохраняем и проверяем выбор на сайте…');
    try {
      const flight=this.read(FLIGHT_KEY);
      if (flight?.body && Array.isArray(flight.keys)) {
        try { await this.execute(flight); }
        catch (error) {
          if (error.status!==409 || !this.validState(error.state)) throw error;
          this.acceptState(error.state);
          try { this.storage.removeItem(FLIGHT_KEY); } catch { this.storageFailed=true; }
        }
      }
      this.acceptState(await this.request());
      if (!this.connection().imported) {
        const changes=this.cleanVotes(this.getLocalVotes());
        const before={...this.server.votes};
        await this.execute({body:{requestId:this.uuid(),mode:'importMissing',baseRevision:this.server.revision,changes},keys:[],before});
      }
      // Bounded conflict retries handle other devices without replacing their changes.
      for (let attempt=0;attempt<5;attempt++) {
        const all=this.pending(); const latest=this.latest(all); const ready=[], done=[]; this.conflicts=[];
        for (const item of latest) {
          const remote=value(this.server.votes[item.id]);
          if (remote===item.value) done.push(...all.filter(x=>x.id===item.id));
          else if (remote!==item.base) this.conflicts.push({id:item.id,local:item.value,remote});
          else ready.push(item);
        }
        this.acknowledge(done);
        if (!ready.length) break;
        const wanted=new Set(ready.map(x=>x.id));
        const next={body:{requestId:this.uuid(),mode:'patch',baseRevision:this.server.revision,changes:Object.fromEntries(ready.map(x=>[x.id,x.value]))},
          keys:all.filter(x=>wanted.has(x.id)).map(x=>x.key),before:{...this.server.votes}};
        try { await this.execute(next); }
        catch (error) {
          if (error.status!==409 || !this.validState(error.state)) throw error;
          this.acceptState(error.state);
          try { this.storage.removeItem(FLIGHT_KEY); } catch { this.storageFailed=true; }
        }
      }
      this.display();
      if (this.conflicts.length) this.emit('conflict','Некоторые оценки изменены на другом устройстве. Выберите, какие оставить.');
      else if (this.pending().length) this.emit('syncing','Изменения сохранены в браузере. Нажмите «Повторить», чтобы отправить оставшиеся.');
      else if (this.storageFailed) this.emit('storage','Выбор сохранён на сайте, но браузер не сохраняет подключение. При следующем посещении понадобится вход.');
      else this.emit('saved',`Выбор сохранён на сайте · нравятся ${Object.values(this.server.votes).filter(x=>x==='yes').length}`);
    } catch (error) {
      if (error.status===401 || error.status===403) this.emit('auth','Войдите ещё раз. Несохранённые изменения остаются в этом браузере.');
      else this.emit('offline','Не удалось связаться с сайтом. Изменения сохранены в браузере; повторите отправку, когда появится связь.');
    }
  }
  sync() {
    if (this.running) return this.running;
    const run=()=>this.run();
    this.running=(this.locks?.request ? this.locks.request('daria-selection-cloud-sync',run) : run()).finally(()=>{this.running=null;});
    return this.running;
  }
  async resolve(id, useLocal) {
    await this.sync();
    const all=this.pending().filter(x=>x.id===id); const latest=this.latest(all)[0];
    if (!latest) return;
    if (useLocal) {
      const key=OUTBOX_PREFIX+this.uuid();
      if (!this.write(key,{id,value:latest.value,base:value(this.server.votes[id]),at:this.now()})) return;
    }
    this.acknowledge(all);
    this.conflicts=this.conflicts.filter(x=>x.id!==id);
    this.display();
    return this.sync();
  }
}
