// Group navigation is separate from the persisted per-version rating identity.
export function buildGroups(catalog) {
  if (!Array.isArray(catalog) || !catalog.length) throw Error('Список оформлений пока недоступен. Обновите страницу.');
  const ids=new Set(), groups=new Map();
  for (const item of catalog) {
    if (!/^\w{10}$/.test(item.id) || ids.has(item.id) || !/^[a-z][a-z0-9-]*$/.test(item.groupId) ||
      ['name','description','groupName','groupDescription','variantLabel','url'].some(key=>typeof item[key]!=='string'||!item[key].trim()) ||
      !item.url.startsWith('/') || item.url.startsWith('//')) throw Error('Список оформлений пока недоступен. Обновите страницу.');
    ids.add(item.id);
    if (!groups.has(item.groupId)) groups.set(item.groupId,{id:item.groupId,name:item.groupName,description:item.groupDescription,items:[]});
    const group=groups.get(item.groupId);
    if (group.name!==item.groupName || group.description!==item.groupDescription) throw Error('Не удалось загрузить направления.');
    group.items.push(item);
  }
  return [...groups.values()];
}

export function filterGroups(groups,votes,filter='all') {
  return groups.map(group=>({...group,items:group.items.filter(item=>filter==='all'||(filter==='unseen'?!votes[item.id]:votes[item.id]===filter))})).filter(group=>group.items.length);
}

export function resolveChoice(groups,votes,filter,id) {
  const visible=filterGroups(groups,votes,filter);
  return visible.flatMap(group=>group.items).find(item=>item.id===id)||visible[0]?.items[0]||null;
}

export function stepGroup(groups,votes,filter,current,step) {
  const visible=filterGroups(groups,votes,filter);
  const index=visible.findIndex(group=>group.items.some(item=>item.id===current));
  return index<0?null:visible[index+step]?.items[0]||null;
}

export function rateChoice(groups,{votes,current,filter},value) {
  if (!['yes','no'].includes(value) || resolveChoice(groups,votes,filter,current)?.id!==current) return null;
  const next=stepGroup(groups,votes,filter,current,1);
  return {votes:{...votes,[current]:value},nextId:next?.id||current,atEnd:!next,undo:{id:current,previous:votes[current]??null,filter}};
}

export function undoChoice(votes,entry) {
  const restored={...votes};
  if (entry.previous) restored[entry.id]=entry.previous;else delete restored[entry.id];
  return {votes:restored,current:entry.id,filter:entry.filter};
}
