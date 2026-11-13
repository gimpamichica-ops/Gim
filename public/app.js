'use strict';
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const monthLabel = value => new Date(`${value}-02T12:00:00`).toLocaleDateString('es-AR',{month:'long',year:'numeric'}).replace(' de ',' ');
const groups = {piernas:'Piernas',pecho:'Pecho',espalda:'Espalda',hombros:'Hombros',brazos:'Brazos',cardio:'Cardio',abdomen:'Abdomen',abru:'Ayuda a Abru'};
let db, user, catalog = [], settings = {nombres:{},propios:[],rutinas:[]}, month = today().slice(0,7), group = 'piernas', monthRows = [], exerciseRows = [], current, editing, busy = false, routeVersion = 0;
const name = e => settings.nombres[e.id] || (e.base ? `${name(e.base)} (unilateral)` : e.nombre);
// Unilateral = variante virtual de cada ejercicio (id + '~uni'): sin cambiar el esquema, se registra y grafica aparte.
const exercises = () => { const base = [...catalog,...settings.propios]; return [...base,...base.filter(e => e.grupo !== 'cardio').map(e => ({...e,id:`${e.id}~uni`,base:e}))]; };
const icon = path => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
const implementsList = ['Barra','Mancuerna','Máquina','Polea','Peso corporal'];
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const groupIcons = {piernas:'m8 3 2 8-4 10m10-18-2 8 4 10M10 11h4',pecho:'M4 5v14h16V5M4 12h16M12 5v14',espalda:'M4 4h16l-4 16H8ZM12 4v16',hombros:'M3 16V8l5-4h8l5 4v8M8 4v12m8-12v12',brazos:'m4 17 4-10 4 3 3-6 5 3-3 13H8Z',cardio:'m3 12 4 0 3-8 4 16 3-8h4',abdomen:'M8 3h8l2 18H6ZM12 3v18M7 9h10M7 15h10',abru:'m5 17 6-6 4 2 5-9M14 4h6v6'};
let pickerGroup = null;
const drafts = new Map();
let renderedHash, renderedUser;
function rememberDraft() {
  rememberDay();
  const form = $('#record-form');
  if (!form?.elements || !renderedHash) return;
  drafts.set(`${renderedUser}:${renderedHash}`,{fecha:form.elements.fecha.value,nota:form.elements.nota.value,implemento:form.querySelector('input[name=implemento]:checked')?.value || '',series:[...form.querySelectorAll('.series')].map(row => Object.fromEntries([...row.querySelectorAll('input')].map(input => [input.dataset.field,input.value])))});
}
function message(text = '') { $('#message').textContent = text; $('#message').hidden = !text; if (text) $('#message').scrollIntoView?.({block:'start'}); }
function check(result) { if (result.error) throw result.error; return result.data; }
function fail(error) {
  if (error.status === 401 || ['PGRST301','PGRST303'].includes(error.code)) { rememberDraft(); renderedHash = undefined; ++routeVersion; selectionTarget = null; dayDraft = null; user = null; login(); }
  message(`No pudimos completar la acción. ${error.message || 'Revisá tu conexión e intentá de nuevo.'}`); }
function formatTime(n) { return n < 60 ? n+' s' : Math.floor(n/60)+':'+(n%60 < 10 ? '0' : '')+Number((n%60).toFixed(3)); }
function formatSeries(row,e) { return row.series.map(s => e?.grupo === 'cardio' ? [s.min !== undefined ? s.min+' min' : '',s.km !== undefined ? s.km+' km' : ''].filter(Boolean).join(' · ') : [[s.kg !== undefined ? s.kg+' kg' : '',s.reps !== undefined ? s.reps+' '+(e?.unidad || 'reps') : ''].filter(Boolean).join(' × '),s.seg !== undefined ? formatTime(s.seg) : ''].filter(Boolean).join(' · ')).filter(Boolean).join(' / '); }
function image(e, cls = '') { return e.img ? `<img class="${cls}" src="${escapeHTML(e.img)}" alt="${escapeHTML(name(e))}" loading="lazy">` : `<div class="initial">${escapeHTML(name(e).charAt(0).toUpperCase())}</div>`; }
function equipmentLabel(e) {
  // shortcut: etiqueta visual según el catálogo actual; usar metadatos si se incorporan implementos al catálogo.
  const source = e.img || e.id;
  if (/Cable|Pulley|Pulldown|Pushdown|Face_Pull|Pull_Through|Pallof|abru-jalon/i.test(source)) return 'Polea';
  if (/Dumbbell|Goblet|Hammer_Curls|Concentration_Curls|Side_Lateral|Reverse_Flyes|Seated_Bent-Over/i.test(source)) return 'Mancuerna';
  if (/Machine|Leverage|Leg_Press|Leg_Extensions|Leg_Curl|Thigh_|Calf_Raise|Hack_Squat|Butterfly|Treadmill|Stationary|Elliptical|Stairmaster|Recumbent/i.test(source)) return 'Máquina';
  if (/Barbell|EZ-Bar|Deadlift|Good_Morning|Military_Press|Lying_Triceps_Press|T-Bar_Row/i.test(source)) return 'Barra';
  if (/Pullups|Chin-Up|Dips|Pushups|Inverted_Row|Muscle_Up|front-lever|Front_Lever|dragon-flag|Dragon_Flag|Crunch|Sit-Up|Plank|Side_Bridge|Dead_Bug|Leg_Raise|Knee_Hip_Raise|Mountain_Climbers|Air_Bike/i.test(source)) return 'Peso corporal';
  return 'A elección';
}
function login() {
  pendingStatus();
  $('#nav').hidden = $('#settings-link').hidden = true;
  $('#app').innerHTML = `<section class="login"><div class="login-logo" aria-hidden="true">GYM<span>&bull;</span></div><p class="eyebrow">Tu espacio de entrenamiento</p><h1>Un día más.<br>Un poco más fuerte.</h1><p class="muted">Entrá para guardar tus entrenamientos y ver cómo avanzás.</p><form id="login"><label>Email<input type="email" name="email" autocomplete="username" required></label><label>Contraseña<input type="password" name="password" autocomplete="current-password" required></label><button class="primary wide">Entrar <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button></form></section>`;
  $('#login').onsubmit = async event => {
    event.preventDefault(); const form = event.target; const button = form.querySelector('button'); button.disabled = true; message();
    try { const result = check(await db.auth.signInWithPassword({email:form.email.value.trim(),password:form.password.value})); user = result.user; localStorage.setItem('gym:session-user',JSON.stringify(user)); await loadSettings(); await flushQueue(); await route(); }
    catch (error) { fail(error); } finally { button.disabled = false; }
  };
}
const networkError = e => !e.code && !e.status && /fetch|network|offline|load failed/i.test(e.message || '');
const storageKey = kind => 'gym:'+user.id+':'+kind;
const pending = () => JSON.parse(localStorage.getItem(storageKey('queue')) || '[]');
function storeQueue(items) { localStorage.setItem(storageKey('queue'),JSON.stringify(items)); pendingStatus(); }
function pendingStatus() {
  let el = document.getElementById('pending-status');
  if (!el) { el = document.createElement('aside'); el.id = 'pending-status'; document.querySelector('header').after(el); }
  const items = user ? pending() : [];
  el.hidden = !items.length;
  el.innerHTML = '<small>'+items.length+' cambios pendientes de subir</small><small>Guardado en el celular. Se sube solo cuando vuelva la señal.</small>'+items.filter(o => o.error).map(o => '<p>'+escapeHTML(o.error)+' <button data-discard="'+escapeHTML(o.id)+'">Descartar</button></p>').join('');
}
async function cachedRead(key,query) {
  const storage = storageKey(key);
  try { const data = check(await query); localStorage.setItem(storage,JSON.stringify(data)); return data; }
  catch (e) { if (!networkError(e)) throw e; message('Sin señal. Mostramos lo guardado en este celular.'); return JSON.parse(localStorage.getItem(storage) || (key === 'settings' ? 'null' : '[]')); }
}
async function applyOperation(op) {
  if (op.kind === 'day') return persistDay(op.data);
  if (op.kind === 'delete') return check(await db.from('registros').delete().eq('id',op.data.id));
  return check(await db.from('registros').upsert(op.data,{onConflict:'id'}));
}
let syncing = false;
async function flushQueue() {
  if (navigator.locks) return navigator.locks.request('gym-sync',drainQueue);
  return drainQueue();
}
async function drainQueue() {
  if (!user || syncing) return;
  const owner = user.id; syncing = true;
  try {
    while (pending().length) {
      const op = pending()[0];
      if (op.error || user?.id !== owner) break;
      try { await applyOperation(op); if (user?.id !== owner) break; for (const [table,key] of [['registros','records'],['dias','days']]) { const cacheKey = storageKey(key); localStorage.setItem(cacheKey,JSON.stringify(overlayRows(JSON.parse(localStorage.getItem(cacheKey) || '[]'),table,[op]))); } storeQueue(pending().filter(o => o.id !== op.id)); }
      catch (e) { if (user?.id === owner && !networkError(e)) storeQueue(pending().map(o => o.id === op.id ? {...o,error:e.message || 'Revisá los datos y permisos.'} : o)); break; }
    }
  } finally { syncing = false; }
}
async function writeOperation(op) {
  storeQueue([...pending(),op]);
  await flushQueue();
  const failed = pending().find(o => o.id === op.id);
  if (failed?.error) { storeQueue(pending().filter(o => o.id !== op.id)); throw new Error(failed.error); }
  if (failed) message('Guardado en el celular. Se sube solo cuando vuelva la señal.');
}
function overlayRows(rows,table,operations = pending()) {
  let result = rows || [];
  for (const op of operations) {
    const d = op.data;
    if (table === 'registros' && op.kind === 'record') result = [...result.filter(r => r.id !== d.id),d];
    if (table === 'registros' && op.kind === 'delete') result = result.filter(r => r.id !== d.id);
    if (op.kind === 'day') {
      if (table === 'dias') { result = result.filter(r => r.fecha !== d.fecha); if (d.fue !== null) result.push({...d,user_id:d.owner}); }
      else { result = result.filter(r => r.fecha !== d.fecha || ![...d.entries.map(e => e.ejercicio),...(d.removed || [])].includes(r.ejercicio)); result.push(...d.entries.map(e => ({...e,id:e.id || 'pending-'+d.fecha+'-'+e.ejercicio,fecha:d.fecha,user_id:d.owner,series:parseDaySeries(e.series)}))); }
    }
  }
  return result;
}
const repeatSeries = series => ({...(series.at(-1) || {})});
let weekOffset = 0;
const muscleNames = {neck:'Cuello',shoulders:'Hombros',chest:'Pecho',biceps:'Bíceps',triceps:'Tríceps',forearms:'Antebrazos',abdominals:'Abdominales',abductors:'Abductores',adductors:'Aductores',quadriceps:'Cuádriceps',calves:'Gemelos',traps:'Trapecios',lats:'Dorsales','middle back':'Espalda media','lower back':'Espalda baja',glutes:'Glúteos',hamstrings:'Isquiotibiales'};
// La semana arranca el domingo: el mapa se reinicia cada domingo.
function weeklyVolume(rows,date = today()) {
  const start = dateShift(date,-new Date(date+'T12:00:00').getDay()), end = dateShift(start,7);
  const totals = Object.fromEntries(Object.keys(muscleNames).map(k => [k,0]));
  for (const row of rows.filter(r => r.fecha >= start && r.fecha < end)) {
    const e = exercises().find(e => e.id === row.ejercicio);
    if (e?.grupo === 'cardio') continue;
    // Un ejercicio marcado sin números cuenta como 1 serie: se hizo, pero no sabemos cuántas.
    for (const key of Object.keys(totals)) totals[key] += (row.series.length || 1)*((e?.musculos || []).includes(key) ? 1 : (e?.secundarios || []).includes(key) ? 0.5 : 0);
  }
  return {start,end,totals};
}
// Series semanales por músculo: menos de 4 poco, 4 a 9 medio, 10 o más mucho (rango típico de hipertrofia 10–20).
const heat = v => !v ? {color:'#46546a',label:'Sin trabajar'} : v < 4 ? {color:'#22c55e',label:'Poco'} : v < 10 ? {color:'#facc15',label:'Medio'} : {color:'#ef4444',label:'Mucho'};
const heatLegend = '<p class="legend"><span><span class="swatch" style="background:#22c55e"></span>Poco (1–3)</span><span><span class="swatch" style="background:#facc15"></span>Medio (4–9)</span><span><span class="swatch" style="background:#ef4444"></span>Mucho (10+)</span></p>';
function weeklyHTML(rows) {
  const {start,end,totals} = weeklyVolume(rows,dateShift(today(),weekOffset*7));
  return '<section class="panel"><div class="row between"><button data-week="-1" aria-label="Semana anterior">‹</button><h2>'+(!weekOffset ? 'Esta semana' : 'Semana anterior')+'</h2><button data-week="1" aria-label="Semana siguiente" '+(!weekOffset ? 'disabled' : '')+'>›</button></div><p>Domingo '+start+' — sábado '+dateShift(end,-1)+'</p>'+muscleMap({volume:totals})+'<ul class="weekly-list">'+Object.entries(totals).filter(([k]) => k !== 'neck').sort((a,b) => b[1]-a[1]).map(([k,v]) => '<li><span class="swatch" style="background:'+heat(v).color+'"></span> '+muscleNames[k]+': <strong>'+v.toLocaleString('es-AR')+'</strong> serie'+(v === 1 ? '' : 's')+' · '+heat(v).label.toLowerCase()+'</li>').join('')+'</ul></section>';
}
// Rutinas: [{id,nombre,dias:[{id,nombre,ejercicios:[{id,series?,objetivo?,kg?,seg?,min?}]}]}]. El formato viejo (días sueltos con ids) se agrupa en "Mi rutina" sin cambiar los ids de los días, así los días ya marcados siguen apuntando bien.
function normalizeRoutines(list = []) {
  const day = d => ({...d,ejercicios:(d.ejercicios || []).map(x => typeof x === 'string' ? {id:x} : x)});
  const old = list.filter(r => !r.dias);
  return [...(old.length ? [{id:'mi-rutina',nombre:'Mi rutina',dias:old.map(day)}] : []),...list.filter(r => r.dias).map(p => ({...p,dias:p.dias.map(day)}))];
}
const routineDays = () => settings.rutinas.flatMap(p => p.dias.map((d,i) => ({...d,programa:p,numero:i+1})));
const findRoutineDay = (rutinas,id) => rutinas.flatMap(p => p.dias).find(d => d.id === id);
async function loadSettings() {
  const owner = user;
  const data = await cachedRead('settings',db.from('ajustes').select('nombres,propios,rutinas').eq('user_id',owner.id).maybeSingle());
  if (user !== owner) return;
  settings = {nombres:data?.nombres || {},propios:data?.propios || [],rutinas:normalizeRoutines(data?.rutinas)};
}
async function saveSettings(next) {
  const owner = user;
  check(await db.from('ajustes').upsert({user_id:owner.id,...next})); if (user === owner) { settings = next; localStorage.setItem(storageKey('settings'),JSON.stringify(next)); }
}
async function route() {
  const version = ++routeVersion;
  if (!user) return;
  rememberDraft(); swapOpen = null;
  message(); $('#nav').hidden = $('#settings-link').hidden = false;
  if (location.hash === '#mes') location.hash = '#resumen';
  const hash = location.hash || '#resumen';
  if (hash !== '#registrar' && !hash.startsWith('#dia/')) selectionTarget = null;
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active',a.hash === (hash.startsWith('#progreso/') ? '#progreso' : hash.startsWith('#ejercicio/') ? '#registrar' : hash.startsWith('#dia/') ? '#resumen' : hash.startsWith('#abru/') ? '#abru' : hash)));
  try {
    if (hash.startsWith('#ejercicio/')) {
      const [,id,recordId] = hash.split('/');
      const e = exercises().find(item => item.id === decodeURIComponent(id));
      if (!e) throw new Error('Ese ejercicio no existe.');
      const rows = overlayRows(await cachedRead('records',db.from('registros').select('*').eq('user_id',user.id).order('fecha',{ascending:false}).order('creado',{ascending:false})),'registros').filter(r => r.ejercicio === e.id);
      if (version !== routeVersion) return;
      current = e; exerciseRows = rows; editing = recordId ? rows.find(row => row.id === recordId) : null;
      if (recordId && !editing) throw new Error('Ese registro ya no existe.');
      renderExercise();
    } else if (hash === '#registrar') { pickerGroup = null; renderPicker(); }
    else if (hash === '#ajustes') $('#app').innerHTML = '<h1>Ajustes</h1><p>'+escapeHTML(user.email)+'</p><button id="logout" class="danger">Cerrar sesión</button>';
    else if (hash === '#progreso' || hash.startsWith('#progreso/')) await renderProgress(hash.split('/')[1],version);
    else if (hash === '#rutinas') renderRoutines();
    else if (hash.startsWith('#dia/')) await openDay(hash.slice(5),version);
    else if (hash.startsWith('#abru')) renderAbru(hash.split('/')[1] ? decodeURIComponent(hash.split('/')[1]) : null);
    else await renderMonth(version);
    if (version === routeVersion) { renderedHash = hash; renderedUser = user.id; window.scrollTo(0,0); }
  } catch (error) { if (version === routeVersion) fail(error); }
}
async function renderMonth(version) {
  const [year,m] = month.split('-').map(Number);
  const end = new Date(year,m,1); const next = `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-01`;
  const attendance = overlayRows(await cachedRead('days',db.from('dias').select('*').eq('user_id',user.id).order('fecha',{ascending:false})),'dias');
  const allRows = overlayRows(await cachedRead('records',db.from('registros').select('*').eq('user_id',user.id).order('fecha',{ascending:false}).order('creado',{ascending:false})),'registros');
  const rows = allRows.filter(r => r.fecha >= `${month}-01` && r.fecha < next);
  if (version !== routeVersion) return;
  monthRows = rows;
  const marked = attendance.filter(d => d.fecha.startsWith(month));
  const days = [...new Set([...rows.map(row => row.fecha),...marked.map(d => d.fecha)])].sort().reverse();
  $('#app').innerHTML = `<p class="eyebrow">Tu entrenamiento, día a día</p><div class="row between month"><button data-month="-1" aria-label="Mes anterior">‹</button><h1>${escapeHTML(monthLabel(month))}</h1><button data-month="1" aria-label="Mes siguiente">›</button></div><a class="primary button wide" href="#registrar"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> Registrar</a>${summaryHTML(attendance)}${weeklyHTML(allRows)}<p class="muted">${rows.length} registro${rows.length === 1 ? '' : 's'} · ${days.length} día${days.length === 1 ? '' : 's'} de movimiento</p>${days.length ? days.map(day => `<section class="day"><div class="dayhead"><span class="date-badge"><strong>${Number(day.slice(-2))}</strong><span>${new Date(`${day}T12:00:00`).toLocaleDateString('es-AR',{weekday:'short'})}</span></span><h2><button data-day="${day}">${marked.find(d => d.fecha === day)?.fue === false ? "No fui" : "Tu entrenamiento"}</button></h2></div>${marked.find(d => d.fecha === day)?.comentario ? `<p>${escapeHTML(marked.find(d => d.fecha === day).comentario)}</p>` : ""}${rows.filter(row => row.fecha === day).map(row => { const e = exercises().find(e => e.id === row.ejercicio); return `<button class="entry" data-record="${escapeHTML(row.id)}"><div><strong>${escapeHTML(e ? name(e) : row.ejercicio)}${row.implemento ? ` · ${escapeHTML(row.implemento)}` : ''}</strong><small>${row.series.length} serie${row.series.length === 1 ? '' : 's'}</small><small>${escapeHTML(formatSeries(row,e))}</small>${row.nota ? `<small>${escapeHTML(row.nota)}</small>` : ''}</div><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>`; }).join('')}</section>`).join('') : '<div class="panel empty">Todavía no hay entrenamientos este mes.<br>Tu próximo paso empieza con un registro.</div>'}`;
}
function renderPicker() {
  $('#app').innerHTML = `<p class="eyebrow">Sumá un entrenamiento</p><h1>¿Qué entrenás hoy?</h1><label class="search">Buscar en todos los grupos<input id="exercise-search" type="search" placeholder="Nombre del ejercicio" autocomplete="off"></label><div id="picker-results"></div>`;
  renderPickerResults();
  $('#exercise-search').oninput = renderPickerResults;
}
function renderPickerResults() {
  const query = normalize($('#exercise-search').value || '');
  const all = exercises();
  const target = $('#picker-results');
  if (query) {
    const matches = all.filter(e => normalize(name(e)).includes(query));
    target.innerHTML = `<p class="muted" role="status">${matches.length} resultado${matches.length === 1 ? '' : 's'}</p>${matches.map(e => `<button class="entry search-result" data-exercise="${escapeHTML(e.id)}">${image(e)}<div><strong>${escapeHTML(name(e))}</strong><div class="chips"><span class="chip group-${escapeHTML(e.grupo)}">${escapeHTML(groups[e.grupo])}</span><span class="chip">${equipmentLabel(e)}</span></div></div></button>`).join('')}`;
  } else if (!pickerGroup) {
    target.innerHTML = `<div class="group-grid">${Object.entries(groups).filter(([id]) => id !== 'abru').map(([id,title]) => `<button class="group-card group-${id}" data-group="${id}">${icon(groupIcons[id])}<strong>${title}</strong><small>${all.filter(e => !e.base && e.grupo === id).length} ejercicios</small></button>`).join('')}</div>`;
  } else {
    const items = all.filter(e => !e.base && e.grupo === pickerGroup);
    target.innerHTML = `<button id="all-groups">‹ Todos los grupos</button><h2 class="group-title group-${pickerGroup}">${escapeHTML(groups[pickerGroup])}</h2><div class="carousel" id="exercise-carousel" aria-label="Ejercicios de ${escapeHTML(groups[pickerGroup])}">${items.map(e => `<article class="card">${image(e)}<div class="chips"><span class="chip group-${escapeHTML(e.grupo)}">${escapeHTML(groups[e.grupo])}</span><span class="chip">${equipmentLabel(e)}</span></div><h2>${escapeHTML(name(e))}</h2><button class="primary wide" data-exercise="${escapeHTML(e.id)}">Elegir ${icon('M5 12h14m-6-6 6 6-6 6')}</button>${e.grupo !== 'cardio' ? `<button class="wide" data-exercise="${escapeHTML(e.id)}~uni">Unilateral</button>` : ''}</article>`).join('')}</div><div class="carousel-controls"><button data-slide="-1" aria-label="Ejercicio anterior">‹</button><span id="carousel-count" aria-live="polite">${items.length ? 1 : 0} / ${items.length}</span><button data-slide="1" aria-label="Ejercicio siguiente">›</button></div>`;
  }
  if (!query && pickerGroup) target.innerHTML += `<button class="wide add-exercise" data-add="${pickerGroup}">${icon('M12 5v14M5 12h14')} Agregar ejercicio propio</button>`;
  if (!query && pickerGroup) {
    const items = all.filter(e => !e.base && e.grupo === pickerGroup);
    const carousel = $('#exercise-carousel');
    const update = () => { const index = Math.round(carousel.scrollLeft / Math.max(1,carousel.clientWidth)); $('#carousel-count').textContent = `${items.length ? index+1 : 0} / ${items.length}`; document.querySelector('[data-slide="-1"]').disabled = index === 0; document.querySelector('[data-slide="1"]').disabled = index >= items.length-1; };
    carousel.onscroll = update;
    if (carousel.clientWidth) update();
  }
}
function renderAbru(program = null) {
  const completed = (settings.nombres.__abru || '').split(',');
  const all = exercises().filter(e => !e.base && e.grupo === 'abru');
  if (!program) {
    $('#app').innerHTML = '<p class="eyebrow">De a un paso</p><h1>Ayuda a Abru</h1>'+[...new Set(all.map(e => e.programa || 'Dominadas'))].map(title => { const steps = all.filter(e => (e.programa || 'Dominadas') === title); return `<a class="panel program" href="#abru/${encodeURIComponent(title)}">${image(steps[0])}<div><h2>${escapeHTML(title)}</h2><p>${steps.filter(e => completed.includes(e.id)).length}/${steps.length} superados</p></div></a>`; }).join(''); return;
  }
  const steps = all.filter(e => (e.programa || 'Dominadas') === program); const active = steps.find(e => !completed.includes(e.id));
  $('#app').innerHTML = `<p class="eyebrow">De a un paso</p><a class="button back" href="#abru">? Abru</a><h1>${escapeHTML(program)}</h1><div class="abru-progress"><p>${steps.filter(e => completed.includes(e.id)).length} / ${steps.length} pasos superados</p><progress max="${steps.length}" value="${steps.filter(e => completed.includes(e.id)).length}" aria-label="Pasos superados"></progress></div><p class="muted">Practicá 2–3 veces por semana y descansá entre días. Pasá de nivel cuando cumplas el criterio del paso. La constancia vale más que apurarse.</p>${steps.map((e,i) => `<section class="panel step ${active?.id === e.id ? 'current' : ''} ${completed.includes(e.id) ? 'done' : ''}"><p class="eyebrow">Paso ${i+1}${active?.id === e.id ? ' · Estás acá' : ''}${completed.includes(e.id) ? ' · Superado ✓' : ''}</p><div class="row">${image(e)}<h2>${escapeHTML(name(e))}</h2></div><p>${escapeHTML(e.como || 'Registrá tus series y avanzá a tu ritmo.')}</p>${e.pasar ? `<p><strong>Pasás al siguiente cuando:</strong> ${escapeHTML(e.pasar)}</p>` : ''}<div class="actions"><button class="primary" data-exercise="${escapeHTML(e.id)}"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> Registrar</button><button data-complete="${escapeHTML(e.id)}">${completed.includes(e.id) ? 'Desmarcar' : '¡Superado!'}</button></div></section>`).join('')}<button class="wide" data-add="abru"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> Agregar ejercicio propio</button>`;
}
function muscleMap(e) {
  const front = [
    ['neck','M43 32H57L59 44H41Z'],
    ['shoulders','M35 43Q22 41 20 58L31 63 39 48Z M65 43Q78 41 80 58L69 63 61 48Z'],
    ['chest','M38 48Q43 45 49 49V69Q39 75 33 64Z M62 48Q57 45 51 49V69Q61 75 67 64Z'],
    ['biceps','M21 62Q16 73 17 87L25 90Q32 76 30 65Z M79 62Q84 73 83 87L75 90Q68 76 70 65Z'],
    ['forearms','M17 90Q12 101 12 119L18 121 25 93Z M83 90Q88 101 88 119L82 121 75 93Z'],
    ['abdominals','M41 75H49V84H41Z M51 75H59V84H51Z M42 87H49V96H42Z M51 87H58V96H51Z M43 99H49V109H44Z M51 99H57L56 109H51Z'],
    ['abductors','M34 109L40 113 34 135 30 131Z M66 109L60 113 66 135 70 131Z'],
    ['adductors','M43 116L49 121 44 150 39 137Z M57 116L51 121 56 150 61 137Z'],
    ['quadriceps','M34 119Q27 139 31 160L39 164Q46 144 40 121Z M66 119Q73 139 69 160L61 164Q54 144 60 121Z'],
    ['calves','M32 172Q28 184 34 200L39 200 42 173Z M68 172Q72 184 66 200L61 200 58 173Z']
  ];
  const back = [
    ['neck','M43 32H57L59 44H41Z'],
    ['traps','M42 40L33 49 43 65 50 73 57 65 67 49 58 40 50 46Z'],
    ['shoulders','M33 44Q21 43 20 59L31 63 38 51Z M67 44Q79 43 80 59L69 63 62 51Z'],
    ['triceps','M21 63Q16 74 17 89L25 91 31 67Z M79 63Q84 74 83 89L75 91 69 67Z'],
    ['forearms','M17 93Q12 104 12 119L18 121 25 95Z M83 93Q88 104 88 119L82 121 75 95Z'],
    ['lats','M33 65L47 79 47 103Q36 95 33 82Z M67 65L53 79 53 103Q64 95 67 82Z'],
    ['middle back','M45 67L50 74 55 67 53 90H47Z'],
    ['lower back','M46 94H54L60 113 50 117 40 113Z'],
    ['glutes','M35 115Q40 111 49 117V136Q39 143 31 134Z M65 115Q60 111 51 117V136Q61 143 69 134Z'],
    ['hamstrings','M32 140L48 142 41 164 31 163Z M68 140L52 142 59 164 69 163Z'],
    ['calves','M32 171Q27 183 33 196L37 201 42 194 42 173Z M68 171Q73 183 67 196L63 201 58 194 58 173Z']
  ];
  const body = 'M41 35L40 41Q23 39 19 54L14 85 9 119Q8 126 14 128L20 125 29 94 33 77 36 96 30 117Q26 136 28 160L30 172 30 199 27 211Q32 215 40 211L43 184 47 163 50 144 53 163 57 184 60 211Q68 215 73 211L70 199 70 172 72 160Q74 136 70 117L64 96 67 77 71 94 80 125 86 128Q92 126 91 119L86 85 81 54Q77 39 60 41L59 35Z';
  const figure = (regions,x) => '<g transform="translate('+x+' 0)"><g fill="#344156" stroke="#111722"><ellipse cx="50" cy="21" rx="12" ry="15"/><path d="'+body+'"/></g>'+regions.map(([muscle,path]) => '<path class="region '+((e.musculos || []).includes(muscle) ? 'primary-muscle' : (e.secundarios || []).includes(muscle) ? 'secondary' : '')+'"'+(e.volume ? ' style="fill:'+heat(e.volume[muscle]).color+'"' : '')+' d="'+path+'"><title>'+(e.volume ? (muscleNames[muscle] || muscle)+': '+(e.volume[muscle] || 0)+' series' : muscleNames[muscle] || muscle)+'</title></path>').join('')+'</g>';
  return '<section class="panel muscles"><h3>'+(e.volume ? 'Series por músculo' : 'Músculos que trabajás')+'</h3><svg viewBox="0 0 210 230" role="img" aria-label="Mapa muscular de frente y espalda">'+figure(front,0)+figure(back,110)+'<g fill="#a8b6ce" font-size="9" text-anchor="middle"><text x="50" y="226">FRENTE</text><text x="160" y="226">ESPALDA</text></g></svg>'+(e.volume ? heatLegend : '<p class="legend"><span><span class="swatch primary-swatch"></span>Principal</span><span><span class="swatch secondary-swatch"></span>Secundario</span></p>'+(!(e.musculos || []).length ? '<small>Sin músculos especificados para este ejercicio.</small>' : ''))+'</section>';
}

function progress(e,rows,period = 'day') {
  const metrics = e.grupo === 'cardio' ? [['min','Minutos totales','min'],['km','Km','km']] : [['kg','Peso máximo','kg'],['reps','Repeticiones máximas',e.unidad || 'reps'],['seg','Tiempo máximo','seg']];
  const days = [...new Set(rows.map(r => r.fecha))].sort().map(date => {
    const sets = rows.filter(r => r.fecha === date).flatMap(r => r.series);
    return {date,values:Object.fromEntries(metrics.map(([field]) => { const values = sets.map(s => s[field]).filter(Number.isFinite); return [field,values.length ? (e.grupo === 'cardio' ? values.reduce((a,b) => a+b,0) : Math.max(...values)) : undefined]; }))};
  });
  const keys = [...new Set(days.map(d => d.date.slice(0,period === 'month' ? 7 : 10)))];
  const html = metrics.map(([field,label,unit]) => {
    const points = keys.map(key => { const values = days.filter(d => d.date.startsWith(key)).map(d => d.values[field]).filter(Number.isFinite); return {key,value:values.length ? Math.max(...values) : undefined}; }).filter(p => p.value !== undefined);
    if (!points.length) return '';
    const max = Math.max(1,...points.map(p => p.value)), display = n => field === 'seg' ? formatTime(n) : n+' '+unit;
    const coords = points.map((p,i) => [45+i*250/Math.max(1,points.length-1),115-p.value/max*90]);
    return '<section class="panel"><h2>'+escapeHTML(label)+'</h2><svg class="chart" viewBox="0 0 340 155" role="img" aria-label="'+escapeHTML(label+(period === 'month' ? ' mes a mes' : ' día a día'))+'"><path d="M45 20V120H310" fill="none" stroke="#a8b6ce"/><polyline points="'+coords.map(c => c.join(',')).join(' ')+'" fill="none" stroke="#60a5fa" stroke-width="3"/>'+points.map((p,i) => '<circle cx="'+coords[i][0]+'" cy="'+coords[i][1]+'" r="4" fill="#93c5fd"><title>'+escapeHTML(p.key+': '+display(p.value))+'</title></circle>').join('')+'<g fill="#a8b6ce" font-size="12"><text x="2" y="15">'+escapeHTML(display(Math.max(...points.map(p => p.value))))+'</text><text x="2" y="120">0</text><text x="45" y="145">'+escapeHTML(points[0].key)+'</text><text x="335" y="145" text-anchor="end">'+(points.length > 1 ? escapeHTML(points.at(-1).key) : '')+'</text></g></svg>'+points.map(p => '<div class="progress-row"><strong>'+escapeHTML(p.key)+'</strong> · '+escapeHTML(display(p.value))+'</div>').join('')+'</section>';
  }).join('');
  return html || '<p class="muted">Tu progreso va a aparecer cuando registres alguna métrica.</p>';
}
async function renderProgress(id,version) {
  const rows = overlayRows(await cachedRead('records',db.from('registros').select('*').eq('user_id',user.id).order('fecha',{ascending:false})),'registros');
  if (version !== routeVersion) return;
  if (!id) {
    $('#app').innerHTML = '<h1>Progreso</h1>'+([...new Set(rows.map(r => r.ejercicio))].map(id => { const e = exercises().find(e => e.id === id) || {id,nombre:id}, records = rows.filter(r => r.ejercicio === id); return '<a class="entry search-result" href="#progreso/'+encodeURIComponent(id)+'">'+image(e)+'<div><strong>'+escapeHTML(name(e))+'</strong><small>'+records.length+' registro'+(records.length === 1 ? '' : 's')+' · '+escapeHTML(records[0].fecha)+'</small></div></a>'; }).join('') || '<p class="muted">Todavía no hay registros.</p>'); return;
  }
  id = decodeURIComponent(id);
  const e = exercises().find(e => e.id === id) || {id,nombre:id}, records = rows.filter(r => r.ejercicio === id), equipment = [...new Set(records.map(r => r.implemento || ''))];
  let selected = null;
  $('#app').innerHTML = '<a class="button back" href="#progreso">‹ Progreso</a><h1>'+escapeHTML(name(e))+'</h1><label>Ver progreso<select id="progress-period"><option value="day">Día a día</option><option value="month">Mes a mes</option></select></label><div class="tabs" id="progress-equipment">'+(equipment.length > 1 ? [null,...equipment].map((value,i) => '<button data-equipment-index="'+i+'" aria-pressed="'+(i === 0)+'">'+escapeHTML(value === null ? 'Todos' : value || 'Sin implemento')+'</button>').join('') : '')+'</div><div id="progress-charts"></div>';
  const update = () => { $('#progress-charts').innerHTML = progress(e,selected === null ? records : records.filter(r => (r.implemento || '') === selected),$('#progress-period').value); };
  $('#progress-period').onchange = update;
  $('#progress-equipment').onclick = event => { const button = event.target.closest('button'); if (!button) return; selected = [null,...equipment][Number(button.dataset.equipmentIndex)]; $('#progress-equipment').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed',b === button)); update(); };
  update();
}
function seriesHTML(s = {},e = current) {
  const fields = e.grupo === 'cardio' ? [['min','Minutos'],['km','Km']] : [['kg','Kg'],['reps',e.unidad || 'Reps'],['seg','Tiempo']];
  return '<div class="series '+(e.grupo === 'cardio' ? 'cardio-series' : '')+'"><span></span>'+fields.map(([field,label]) => '<label>'+escapeHTML(label)+'<input aria-label="'+escapeHTML(label)+'" data-field="'+field+'" type="text" inputmode="'+(field === 'seg' ? 'text' : 'decimal')+'" '+(field === 'seg' ? 'placeholder="1:30"' : '')+' value="'+escapeHTML(field === 'seg' && typeof s.seg === 'number' && s.seg >= 60 ? formatTime(s.seg) : s[field] ?? '')+'"></label>').join('')+'<button type="button" data-remove aria-label="Quitar serie">×</button></div>';
}
function numberSeries() { document.querySelectorAll('.series').forEach((row,i) => { row.firstElementChild.textContent = i+1; row.querySelector('[data-remove]').disabled = document.querySelectorAll('.series').length === 1; }); }
function renderExercise() {
  const e = current; const last = exerciseRows.find(r => r.id !== editing?.id);
  $('#app').innerHTML = `<a class="button back" href="${e.grupo === 'abru' ? '#abru' : '#registrar'}">‹ Ejercicios</a><p class="chip group-${escapeHTML(e.grupo)}">${escapeHTML(groups[e.grupo])}</p><div class="row between"><h1>${escapeHTML(name(e))}</h1><button id="rename" aria-label="Renombrar ejercicio">✎</button></div>${settings.nombres[e.id] ? '<button id="reset-name">Volver al nombre original</button>' : ''}${e.grupo !== 'cardio' ? `<a class="button" href="#ejercicio/${encodeURIComponent(e.base ? e.base.id : `${e.id}~uni`)}">${e.base ? 'Ver versión normal' : 'Ver versión unilateral'}</a>` : ''}<button class="hero" id="toggle-image" aria-label="Alternar posición inicial y final">${image(e)}</button>${e.img2 ? '<small>Tocá la imagen para ver la otra posición.</small>' : ''}${e.como ? `<p>${escapeHTML(e.como)}</p>` : ''}${muscleMap(e)}<form id="record-form"><h2>${editing ? 'Editar registro' : 'Tu entrenamiento'}</h2>${last ? `<p class="panel">La última vez · ${escapeHTML(last.fecha)}<br><strong>${escapeHTML(formatSeries(last,e))}</strong>${last.implemento ? ` · ${escapeHTML(last.implemento)}` : ''}</p>` : '<p class="muted">Primer registro. Este es tu punto de partida.</p>'}<label>Fecha<input name="fecha" type="date" required value="${editing?.fecha || today()}"></label>${e.grupo !== 'cardio' ? `<fieldset class="equipment"><legend>Implemento <span class="muted">· opcional</span></legend><label><input type="radio" name="implemento" value="" ${!(editing ? editing.implemento : last?.implemento) ? 'checked' : ''}><span>Sin especificar</span></label>${implementsList.map(value => `<label><input type="radio" name="implemento" value="${value}" ${(editing ? editing.implemento : last?.implemento) === value ? 'checked' : ''}><span>${value}</span></label>`).join('')}</fieldset>` : ''}<div id="series">${(editing ? editing.series : last?.series.length ? last.series : [{}]).map(s => seriesHTML(s)).join('')}</div><div class="actions"><button type="button" id="add-series"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> Serie</button><button type="button" id="copy-series">Copiar la última</button></div><label>Nota<textarea name="nota" rows="3" placeholder="¿Cómo te sentiste?">${escapeHTML(editing?.nota || '')}</textarea></label><button class="primary wide" type="submit"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg> Guardar entrenamiento</button>${editing ? '<button type="button" class="danger wide" id="delete-record" style="margin-top:12px">Borrar registro</button>' : ''}</form><section class="panel"><h2>Tu progreso</h2><a class="button wide" href="#progreso/${encodeURIComponent(e.id)}">Ver gráficos de progreso</a></section><h2>Historial</h2>${exerciseRows.map(r => `<button class="entry" data-record="${escapeHTML(r.id)}"><div><strong>${escapeHTML(r.fecha)}</strong><small>${escapeHTML(name(e))}${r.implemento ? ` · ${escapeHTML(r.implemento)}` : ''}</small><small>${escapeHTML(formatSeries(r,e))}</small></div><span>✎</span></button>`).join('') || '<p class="muted">Todavía no hay registros.</p>'}`;
  const draft = drafts.get(`${user.id}:${location.hash}`);
  if (draft) {
    $('#record-form').elements.fecha.value = draft.fecha;
    $('#record-form').elements.nota.value = draft.nota;
    $('#series').innerHTML = draft.series.map(s => seriesHTML(s)).join('');
    document.querySelectorAll('input[name=implemento]').forEach(input => input.checked = input.value === (draft.implemento || ''));
  }
  numberSeries(); $('#record-form').onsubmit = saveRecord;
}
async function saveRecord(event) {
  event.preventDefault(); if (busy) return; message();
  const form = event.target; const version = routeVersion; const hash = `${renderedUser}:${renderedHash}`;
  try {
    const series = parseDaySeries([...document.querySelectorAll('.series')].map(row => Object.fromEntries([...row.querySelectorAll('input')].map(input => [input.dataset.field,input.value]))));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.fecha.value)) throw new Error('Elegí una fecha válida.');
    const implemento = current.grupo === 'cardio' ? null : form.querySelector('input[name=implemento]:checked')?.value || null;
    if (implemento && !implementsList.includes(implemento)) throw new Error('Elegí un implemento válido.');
    const payload = {implemento,ejercicio:current.id,fecha:form.fecha.value,series,nota:form.nota.value.trim()};
    busy = true; form.querySelector('[type=submit]').disabled = true;
    await writeOperation({id:crypto.randomUUID(),kind:'record',data:{...payload,id:editing?.id || crypto.randomUUID(),user_id:user.id}});
    drafts.delete(hash);
    if (version === routeVersion) renderedHash = undefined;
    if (version === routeVersion) { month = payload.fecha.slice(0,7); location.hash = '#mes'; }
  } catch (error) { if (version === routeVersion) fail(error); } finally { busy = false; form.querySelector('[type=submit]').disabled = false; }
}
let selectionTarget = null;
const dayDrafts = new Map();
let dayDraft;
function dateShift(value, offset) { const d = new Date(`${value}T12:00:00`); d.setDate(d.getDate()+offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function attendanceStats(rows) {
  const marked = rows.filter(d => d.fecha.startsWith(month));
  const attended = new Set(rows.filter(d => d.fue).map(d => d.fecha));
  let cursor = today(), streak = 0;
  if (!attended.has(cursor)) cursor = dateShift(cursor,-1);
  while (attended.has(cursor)) { streak++; cursor = dateShift(cursor,-1); }
  const counts = new Map();
  marked.filter(d => d.fue && d.rutina).forEach(d => counts.set(d.rutina,(counts.get(d.rutina)||0)+1));
  const favorite = [...counts].sort((a,b) => b[1]-a[1])[0]?.[0];
  return {yes:marked.filter(d => d.fue).length,no:marked.filter(d => !d.fue).length,streak,favorite:routineDays().find(r => r.id === favorite)?.nombre || '—'};
}
function summaryHTML(rows) {
  const stats = attendanceStats(rows), [y,m] = month.split('-').map(Number);
  const offset = (new Date(y,m-1,1).getDay()+6)%7;
  return `<div class="stats">${[['Fui',stats.yes],['No fui',stats.no],['Racha actual',`${stats.streak} ${stats.streak===1?"día":"días"}`],['Rutina más hecha',stats.favorite]].map(([label,value]) => `<div class="panel"><small>${label}</small><strong>${escapeHTML(value)}</strong></div>`).join('')}</div><div class="calendar" aria-label="Calendario mensual">${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => `<small>${d}</small>`).join('')}${'<span></span>'.repeat(offset)}${Array.from({length:new Date(y,m,0).getDate()},(_,i) => { const date = `${month}-${String(i+1).padStart(2,'0')}`, day = rows.find(d => d.fecha === date), done = routineDays().find(r => r.id === day?.rutina); return `<button data-day="${date}" class="${date === today() ? 'today' : ''} ${day ? day.fue ? 'attended' : 'absent' : ''}" aria-label="${date}: ${day ? day.fue ? 'Fui' : 'No fui' : 'Sin marcar'}"><span>${i+1}</span><small>${day ? day.fue ? '✓' : '×' : ''}${day?.fue && done ? ` D${done.numero}` : ''}</small></button>`; }).join('')}</div><a class="button wide" href="#rutinas">Mis rutinas</a>`;
}
// Días abiertos en Mis rutinas: se conservan al volver a dibujar la pantalla tras cada cambio.
const openDays = new Set();
document.addEventListener('toggle',event => { const id = event.target.dataset?.openDay; if (id) event.target.open ? openDays.add(id) : openDays.delete(id); },true);
let swapOpen = null; // 'r|<díaId>|<índice>' en Mis rutinas o 'd|<ejercicio>' en la hoja del día
// Ejercicios parecidos: mismo grupo y músculo principal; primero el mismo movimiento (remo, press, curl…), después más secundarios en común.
const movement = x => ((x.img || x.id).match(/Hammer|Lateral|Rear|Row|Pulldown|Pull-?ups?|Chin|Press|Curl|Squat|Lunge|Fl[yi]|Raise|Extension|Pushdown|Deadlift|Dip|Thrust|Bridge|Kickback|Crunch|Shrug|Ad?b?duct/i) || [''])[0].toLowerCase();
function alternatives(id) {
  const found = exercises().find(x => x.id === id); if (!found) return [];
  const e = found.base || found, sec = e.secundarios || [], move = movement(e);
  return exercises().filter(x => !x.base && x.id !== e.id && x.grupo === e.grupo && x.grupo !== 'abru' && ((move && movement(x) === move) || (e.musculos || []).some(m => (x.musculos || []).includes(m))))
    .map(x => [x,(move && movement(x) === move ? 10 : 0)+(x.secundarios || []).filter(m => sec.includes(m)).length]).sort((a,b) => b[1]-a[1]).slice(0,6).map(([x]) => x);
}
function swapHTML(key,id,taken = []) {
  if (swapOpen !== key) return '';
  const alts = alternatives(id).filter(x => !taken.includes(x.id));
  return '<div class="alts"><small>Trabajan lo mismo · tocá uno para cambiarlo</small>'+(alts.map(x => `<button type="button" class="entry search-result" data-swap-to="${escapeHTML(x.id)}">${image(x)}<div><strong>${escapeHTML(name(x))}</strong><small>${equipmentLabel(x)}</small></div></button>`).join('') || '<small>No hay otro ejercicio parecido en el catálogo.</small>')+'</div>';
}
const bigMuscles = ['quadriceps','glutes','hamstrings','chest','lats','shoulders','biceps','triceps'];
const allMuscles = [...bigMuscles,'middle back','adductors','abductors','calves','abdominals'];
// Análisis por reglas (sin IA): supone cada día una vez por semana, 3 series si no hay objetivo, principal 1 y secundario 0,5.
function analyzeRoutine(p) {
  const sets = Object.fromEntries(allMuscles.map(m => [m,0])), days = Object.fromEntries(allMuscles.map(m => [m,new Set()])), used = new Set();
  let cardio = false;
  for (const d of p.dias) for (const it of d.ejercicios) {
    const e = exercises().find(x => x.id === it.id); if (!e) continue;
    used.add((e.base || e).id);
    if (e.grupo === 'cardio') { cardio = true; continue; }
    for (const m of allMuscles) { if ((e.musculos || []).includes(m)) { sets[m] += it.series || it.sets?.length || 3; days[m].add(d.id); } else if ((e.secundarios || []).includes(m)) sets[m] += (it.series || it.sets?.length || 3)/2; }
  }
  const fmt = n => n.toLocaleString('es-AR'), label = m => muscleNames[m].toLowerCase(), list = ms => ms.map(label).join(', ');
  const good = [], bad = [], tips = [];
  const ok = allMuscles.filter(m => sets[m] >= 10 && sets[m] <= 20), twice = bigMuscles.filter(m => days[m].size >= 2);
  if (ok.length) good.push('Buen volumen semanal (10 a 20 series) en '+list(ok)+'.');
  if (twice.length) good.push('Trabajás '+list(twice)+' en 2 o más días: repartir el volumen rinde más que todo junto.');
  for (const m of bigMuscles.filter(m => sets[m] < 6)) {
    bad.push('Poco volumen de '+label(m)+' ('+fmt(sets[m])+' series por semana).');
    const opts = exercises().filter(x => !x.base && !['abru','cardio'].includes(x.grupo) && (x.musculos || []).includes(m) && !used.has(x.id)).slice(0,2);
    if (opts.length) tips.push('Para '+label(m)+': sumá 3 series de '+opts.map(name).join(' o ')+' en algún día.');
  }
  for (const m of allMuscles.filter(m => sets[m] > 22)) bad.push('Mucho volumen de '+label(m)+' ('+fmt(sets[m])+' series): si no recuperás entre sesiones, sacá 2 o 3 series.');
  const push = sets.chest, pull = sets.lats+sets['middle back'];
  if (push && pull >= push) good.push('Tirás tanto o más de lo que empujás (espalda '+fmt(pull)+' vs pecho '+fmt(push)+'): bueno para la postura y los hombros.');
  else if (push) { bad.push('Más empuje que tirón (pecho '+fmt(push)+' vs espalda '+fmt(pull)+').'); tips.push('Sumá un remo para equilibrar.'); }
  // Abdominales y cardio no alargan tanto la sesión: se cuentan solo los de fuerza.
  const count = d => d.ejercicios.filter(it => !['cardio','abdomen'].includes(exercises().find(x => x.id === it.id)?.grupo)).length, long = p.dias.filter(d => count(d) > 8);
  if (p.dias.length && !long.length) good.push('Días de '+Math.min(...p.dias.map(count))+' a '+Math.max(...p.dias.map(count))+' ejercicios de fuerza: duración razonable.');
  long.forEach(d => bad.push(d.nombre+' es largo ('+count(d)+' ejercicios de fuerza): el final suele salir con menos calidad.'));
  if (sets.quadriceps >= 6 && Math.max(sets.biceps,sets.triceps) > sets.quadriceps) bad.push('Más series de brazos (bíceps '+fmt(sets.biceps)+', tríceps '+fmt(sets.triceps)+') que de cuádriceps ('+fmt(sets.quadriceps)+'): si las piernas son prioridad, cambiá un ejercicio de brazos por uno de cuádriceps.');
  if (p.dias.some(d => d.ejercicios.some(it => /\d\s*[–-]\s*\d/.test(it.objetivo || '')))) tips.push('Progresión: cuando hagas todas las series en el tope del rango (por ejemplo 3 × 12 en un 8–12), subí un poco el peso y volvé al piso del rango.');
  if (!cardio) tips.push('No hay cardio cargado: si lo hacés, agregalo para que quede registrado.');
  const legs = ['quadriceps','glutes','hamstrings','adductors','abductors','calves'].reduce((a,m) => a+sets[m],0), total = Object.values(sets).reduce((a,b) => a+b,0);
  if (total) tips.push('Reparto estimado: '+Math.round(100*legs/total)+'% piernas y glúteos, '+Math.round(100-100*legs/total)+'% torso, brazos y abdomen.');
  return {sets,good,bad,tips};
}
function analysisHTML(p) {
  const {sets,good,bad,tips} = analyzeRoutine(p), ul = items => items.length ? '<ul>'+items.map(t => '<li>'+escapeHTML(t)+'</li>').join('')+'</ul>' : '<p class="muted">Nada para marcar.</p>';
  return '<details class="analysis"><summary>Análisis de la rutina</summary>'+muscleMap({volume:sets})+'<h3>Puntos fuertes</h3>'+ul(good)+'<h3>Para mejorar</h3>'+ul(bad)+'<h3>Ideas</h3>'+ul(tips)+'<small class="muted">Estimado con las series objetivo (3 si no hay), haciendo cada día una vez por semana. Músculo principal cuenta 1 serie y secundario media.</small></details>';
}
function renderRoutines() {
  $('#app').innerHTML = `<p class="eyebrow">Tu plan de entrenamiento</p><h1>Mis rutinas</h1>${settings.rutinas.map(p => `<section class="panel"><div class="row between"><h2>${escapeHTML(p.nombre)}</h2><button data-program-rename="${escapeHTML(p.id)}" aria-label="Renombrar rutina">✎</button></div>${p.dias.map(r => `<details class="routine-day" data-open-day="${escapeHTML(r.id)}" ${openDays.has(r.id) ? 'open' : ''}><summary><strong>${escapeHTML(r.nombre)}</strong><small>${r.ejercicios.length} ejercicio${r.ejercicios.length === 1 ? '' : 's'}</small></summary><button data-routine-rename="${escapeHTML(r.id)}">✎ Renombrar día</button>${r.ejercicios.map((it,i) => { const e = exercises().find(e => e.id === it.id); return `<div class="routine-item"><div><strong>${escapeHTML(e ? name(e) : it.id)}</strong>${it.objetivo ? `<small class="target">${escapeHTML(it.objetivo)}</small>` : ''}</div><div class="row"><button data-routine-move="${escapeHTML(r.id)}" data-index="${i}" data-direction="-1" aria-label="Subir ejercicio" ${i === 0 ? 'disabled' : ''}>↑</button><button data-routine-move="${escapeHTML(r.id)}" data-index="${i}" data-direction="1" aria-label="Bajar ejercicio" ${i === r.ejercicios.length-1 ? 'disabled' : ''}>↓</button><button data-routine-target="${escapeHTML(r.id)}" data-index="${i}" aria-label="Editar series y repeticiones">✎</button><button data-swap-open="r|${escapeHTML(r.id)}|${i}" aria-label="Cambiar por un ejercicio parecido">⇄</button><button data-routine-remove="${escapeHTML(r.id)}" data-index="${i}" aria-label="Quitar ejercicio">×</button></div>${swapHTML(`r|${r.id}|${i}`,it.id,r.ejercicios.map(x => x.id))}</div>`; }).join('')}<div class="actions"><button data-routine-add="${escapeHTML(r.id)}">Agregar ejercicio</button><button class="danger" data-routine-delete="${escapeHTML(r.id)}">Borrar día</button></div></details>`).join('')}<div class="actions"><button data-program-add-day="${escapeHTML(p.id)}">Agregar día</button><button class="danger" data-program-delete="${escapeHTML(p.id)}">Borrar rutina</button></div>${analysisHTML(p)}</section>`).join('') || '<p class="muted">Armá tu primera rutina y adentro sus días.</p>'}<button class="primary wide" id="create-routine">Nueva rutina</button>`;
}
function rememberDay() {
  const form = $('#day-form');
  if (!form?.elements || !dayDraft || dayDraft.owner !== renderedUser) return;
  dayDraft.comentario = form.elements.comentario.value;
  form.querySelectorAll('[data-day-exercise]').forEach(card => {
    const entry = dayDraft.entries.find(e => e.ejercicio === card.dataset.dayExercise);
    entry.implemento = card.querySelector('select').value;
    entry.nota = card.querySelector('textarea').value;
    entry.series = [...card.querySelectorAll('.series')].map(row => Object.fromEntries([...row.querySelectorAll('input')].map(input => [input.dataset.field,input.value])));
  });
}
async function openDay(date,version) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || dateShift(date,0) !== date) throw new Error('Elegí una fecha válida.');
  const owner = user.id, key = `${owner}:${date}`;
  if (dayDrafts.has(key)) { dayDraft = dayDrafts.get(key); renderDay(); return; }
  const days = overlayRows(await cachedRead('days',db.from('dias').select('*').eq('user_id',owner).order('fecha',{ascending:false})),'dias');
  const history = overlayRows(await cachedRead('records',db.from('registros').select('*').eq('user_id',owner).order('fecha',{ascending:false}).order('creado',{ascending:false})),'registros').filter(r => r.fecha <= date);
  const day = days.find(d => d.fecha === date);
  if (version !== routeVersion) return;
  dayDraft = {owner,fecha:date,fue:day?.fue ?? null,rutina:day?.rutina || '',comentario:day?.comentario || '',entries:history.filter(r => r.fecha === date).filter((r,i,all) => all.findIndex(x => x.ejercicio === r.ejercicio) === i).map(r => ({...r,series:r.series.map(s => ({...s}))})).sort((a,b) => (a.creado || '~').localeCompare(b.creado || '~'))}; // en el orden en que se cargaron; lo pendiente sin subir va al final
  dayDraft.history = history;
  dayDrafts.set(key,dayDraft); addRoutineEntries(!day && !dayDraft.entries.length); renderDay();
}
// item = ejercicio de la rutina: completa tantas series como pida el objetivo, con el peso de la última vez, el de cada serie (item.sets) o el del objetivo.
function addDayEntry(id,item = {}) {
  const found = dayDraft.entries.find(e => e.ejercicio === id);
  if (found) { found.objetivo ||= item.objetivo || ''; return; }
  dayDraft.removed = (dayDraft.removed || []).filter(value => value !== id);
  const last = (dayDraft.history || []).find(r => r.ejercicio === id && r.fecha <= dayDraft.fecha);
  const series = last?.series.map(s => ({...s})) || item.sets?.map(s => ({...s})) || [Object.fromEntries(['kg','reps','seg','min'].filter(k => item[k] !== undefined).map(k => [k,item[k]]))];
  while (series.length < (item.series || 1)) series.push(repeatSeries(series));
  dayDraft.entries.push({ejercicio:id,implemento:last?.implemento || '',nota:'',series,objetivo:item.objetivo || ''});
}
// fill=false (día ya guardado): solo muestra objetivos, no vuelve a sumar lo que se quitó o se cambió.
function addRoutineEntries(fill = true) { findRoutineDay(settings.rutinas,dayDraft.rutina)?.ejercicios.forEach(it => { const found = dayDraft.entries.find(e => e.ejercicio === it.id); if (found) found.objetivo ||= it.objetivo || ''; else if (fill) addDayEntry(it.id,it); }); }
function renderDay() {
  const d = dayDraft;
  $('#app').innerHTML = `<a class="button back" href="#resumen">‹ Resumen</a><h1 class="day-title">${escapeHTML(new Date(d.fecha+"T12:00").toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"}))}</h1><form id="day-form"><div class="actions"><button type="button" data-attendance="true" aria-pressed="${d.fue === true}" class="${d.fue === true ? 'primary' : ''}">Fui</button><button type="button" data-attendance="false" aria-pressed="${d.fue === false}" class="${d.fue === false ? 'primary' : ''}">No fui</button><button type="button" id="clear-attendance">Borrar marca</button></div><label>Qué día de rutina hice<select id="day-routine"><option value="">Libre</option>${settings.rutinas.map(p => `<optgroup label="${escapeHTML(p.nombre)}">${p.dias.map(r => `<option value="${escapeHTML(r.id)}" ${d.rutina === r.id ? 'selected' : ''}>${escapeHTML(r.nombre)}</option>`).join('')}</optgroup>`).join('')}</select></label><label>Comentario del día<textarea name="comentario">${escapeHTML(d.comentario)}</textarea></label><h2>Entrenamiento</h2>${d.entries.map(entry => { const e = exercises().find(e => e.id === entry.ejercicio); if (!e) return ''; return `<section class="panel compact" data-day-exercise="${escapeHTML(e.id)}"><div class="row">${image(e)}<h3>${escapeHTML(name(e))}${entry.objetivo ? `<small class="target">Objetivo: ${escapeHTML(entry.objetivo)}</small>` : ''}</h3><button type="button" data-swap-open="d|${escapeHTML(e.id)}" aria-label="Cambiar por un ejercicio parecido">⇄</button><button type="button" class="danger" data-day-remove="${escapeHTML(e.id)}">Quitar</button></div>${swapHTML(`d|${e.id}`,e.id,d.entries.map(x => x.ejercicio))}<label>Implemento<select><option value="">Sin especificar</option>${implementsList.map(value => `<option ${entry.implemento === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><div class="day-series">${entry.series.map(s => seriesHTML(s,e)).join('')}</div><button type="button" data-day-series="${escapeHTML(e.id)}" class="wide">+ Repetir serie</button><label>Nota<textarea>${escapeHTML(entry.nota)}</textarea></label></section>`; }).join('')}<button type="button" id="day-add-exercise" class="wide">Agregar otro ejercicio</button><button class="primary wide" type="submit">Guardar día</button></form>`;
  $('#day-routine').onchange = event => { rememberDay(); d.rutina = event.target.value; addRoutineEntries(); renderDay(); };
  $('#day-form').onsubmit = saveDay;
}
function parseDaySeries(series) {
  return series.map(s => {
    const parsed = {};
    for (const [field,value] of Object.entries(s)) {
      const raw = String(value ?? '').trim().replace(',','.');
      if (!raw) continue;
      let n = Number(raw);
      if (field === 'seg' && raw.includes(':')) {
        if (!/^\d+:[0-5]\d(?:\.\d+)?$/.test(raw)) throw new Error('Tiempo inválido. Usá segundos o m:ss.');
        const [min,sec] = raw.split(':').map(Number); n = min*60+sec;
      }
      if (!Number.isFinite(n) || n < 0) throw new Error('Completá las series con números válidos mayores o iguales a 0.');
      parsed[field] = n;
    }
    return parsed;
  }).filter(s => Object.keys(s).length);
}
async function persistDay(d) {
  const payloads = d.entries.map(entry => {
    const e = exercises().find(e => e.id === entry.ejercicio);
    const series = parseDaySeries(entry.series);
    if (entry.implemento && !implementsList.includes(entry.implemento)) throw new Error('Elegí un implemento válido.');
    return {...entry,user_id:d.owner,fecha:d.fecha,series,implemento:e?.grupo === 'cardio' ? null : entry.implemento || null};
  });
  for (const entry of payloads) {
    // Releer por fecha permite reintentar después de un guardado parcial sin duplicar registros.
    const existing = check(await db.from('registros').select('id').eq('user_id',d.owner).eq('fecha',d.fecha).eq('ejercicio',entry.ejercicio));
    const payload = {user_id:d.owner,fecha:d.fecha,ejercicio:entry.ejercicio,implemento:entry.implemento,series:entry.series,nota:entry.nota.trim()};
    check(await (existing.length ? db.from('registros').update(payload).eq('user_id',d.owner).eq('fecha',d.fecha).eq('ejercicio',entry.ejercicio) : db.from('registros').insert({...payload,id:entry.id || crypto.randomUUID()})));
  }
  for (const id of d.removed || []) check(await db.from('registros').delete().eq('user_id',d.owner).eq('fecha',d.fecha).eq('ejercicio',id));
  if (d.fue === null) check(await db.from('dias').delete().eq('user_id',d.owner).eq('fecha',d.fecha));
  else check(await db.from('dias').upsert({user_id:d.owner,fecha:d.fecha,fue:d.fue,rutina:d.rutina || null,comentario:d.comentario.trim()},{onConflict:'user_id,fecha'}));
}
async function saveDay(event) {
  event.preventDefault(); if (busy) return;
  rememberDay(); const d = dayDraft, version = routeVersion, button = event.target.querySelector('[type=submit]');
  busy = true; button.disabled = true; message();
  try { d.entries.forEach(e => { parseDaySeries(e.series); if (e.implemento && !implementsList.includes(e.implemento)) throw new Error('Implemento inválido.'); e.id ||= crypto.randomUUID(); }); await writeOperation({id:crypto.randomUUID(),kind:'day',data:JSON.parse(JSON.stringify({...d,history:undefined}))}); dayDrafts.delete(`${d.owner}:${d.fecha}`); if (version === routeVersion) { month = d.fecha.slice(0,7); location.hash = '#resumen'; } }
  catch (error) { if (version === routeVersion) fail(error); }
  finally { busy = false; button.disabled = false; }
}
async function selectExercise(id) {
  const target = selectionTarget;
  if (target.type === 'day') { addDayEntry(id); selectionTarget = null; location.hash = `#dia/${dayDraft.fecha}`; }
  else {
    const rutinas = structuredClone(settings.rutinas), day = findRoutineDay(rutinas,target.id);
    if (day && !day.ejercicios.some(it => it.id === id)) day.ejercicios.push({id});
    busy = true; await saveSettings({...settings,rutinas}); selectionTarget = null; location.hash = '#rutinas';
  }
}
async function handleRoutineDayClick(button) {
  const data = button.dataset;
  if (data.day) { location.hash = `#dia/${data.day}`; return true; }
  if (data.attendance) { rememberDay(); dayDraft.fue = data.attendance === 'true'; renderDay(); return true; }
  if (button.id === 'clear-attendance') { rememberDay(); dayDraft.fue = null; renderDay(); return true; }
  if (data.dayRemove) { rememberDay(); dayDraft.entries = dayDraft.entries.filter(e => e.ejercicio !== data.dayRemove); dayDraft.removed = [...new Set([...(dayDraft.removed || []),data.dayRemove])]; renderDay(); return true; }
  if (data.daySeries) { rememberDay(); dayDraft.entries.find(e => e.ejercicio === data.daySeries).series.push(repeatSeries(dayDraft.entries.find(e => e.ejercicio === data.daySeries).series)); renderDay(); return true; }
  if (button.id === 'day-add-exercise' || data.routineAdd) { rememberDay(); selectionTarget = data.routineAdd ? {type:'routine',id:data.routineAdd} : {type:'day'}; location.hash = '#registrar'; return true; }
  if (button.id === 'cancel-selection') { const target = selectionTarget; selectionTarget = null; location.hash = target.type === 'day' ? `#dia/${dayDraft.fecha}` : '#rutinas'; return true; }
  if (data.swapOpen) { swapOpen = swapOpen === data.swapOpen ? null : data.swapOpen; if ($('#day-form')) { rememberDay(); renderDay(); } else renderRoutines(); return true; }
  if (data.swapTo && swapOpen?.startsWith('d|')) {
    rememberDay(); const old = swapOpen.slice(2); swapOpen = null;
    const i = dayDraft.entries.findIndex(e => e.ejercicio === old);
    if (i >= 0 && !dayDraft.entries.some(e => e.ejercicio === data.swapTo)) {
      const [prev] = dayDraft.entries.splice(i,1);
      addDayEntry(data.swapTo,{series:prev.series.length,objetivo:prev.objetivo});
      dayDraft.entries.splice(i,0,dayDraft.entries.pop());
      dayDraft.removed = [...new Set([...(dayDraft.removed || []),old])];
    }
    renderDay(); return true;
  }
  const newId = () => crypto.randomUUID().slice(0,8);
  if (button.id === 'create-routine' || data.swapTo || data.programRename || data.programDelete || data.programAddDay || data.routineRename || data.routineDelete || data.routineRemove || data.routineMove || data.routineTarget) {
    let rutinas = structuredClone(settings.rutinas);
    const p = rutinas.find(p => p.id === (data.programRename || data.programDelete || data.programAddDay));
    const r = findRoutineDay(rutinas,data.routineRename || data.routineDelete || data.routineRemove || data.routineMove || data.routineTarget);
    if (button.id === 'create-routine') { const value = prompt('Nombre de la rutina','Mi rutina'); if (!value?.trim()) return true; rutinas.push({id:newId(),nombre:value.trim(),dias:[{id:newId(),nombre:'Día 1',ejercicios:[]}]}); }
    if (data.swapTo) { const [,dayId,index] = (swapOpen || '').split('|'); swapOpen = null; const day = findRoutineDay(rutinas,dayId), it = day?.ejercicios[Number(index)]; if (!it || day.ejercicios.some(x => x.id === data.swapTo)) return true; it.id = data.swapTo; }
    if (data.programRename) { const value = prompt('Nombre de la rutina',p.nombre); if (!value?.trim()) return true; p.nombre = value.trim(); }
    if (data.programDelete) { if (!confirm(`¿Borrar la rutina "${p.nombre}" con todos sus días? Los entrenamientos guardados se conservan.`)) return true; rutinas = rutinas.filter(item => item.id !== p.id); }
    if (data.programAddDay) p.dias.push({id:newId(),nombre:`Día ${p.dias.length+1}`,ejercicios:[]});
    if (data.routineRename) { const value = prompt('Nombre del día',r.nombre); if (!value?.trim()) return true; r.nombre = value.trim(); }
    if (data.routineDelete) { if (!confirm('¿Borrar este día? Los entrenamientos guardados se conservan.')) return true; rutinas.forEach(item => { item.dias = item.dias.filter(d => d.id !== r.id); }); }
    if (data.routineRemove) r.ejercicios.splice(Number(data.index),1);
    if (data.routineMove) { const i = Number(data.index), j = i+Number(data.direction); if (j >= 0 && j < r.ejercicios.length) [r.ejercicios[i],r.ejercicios[j]] = [r.ejercicios[j],r.ejercicios[i]]; }
    if (data.routineTarget) {
      const it = r.ejercicios[Number(data.index)], value = prompt('Series × repeticiones (ej: 3 × 8-12). Vacío para borrar.',it.objetivo || '');
      if (value === null) return true;
      const n = value.match(/^\s*(\d+)\s*[x×]/i);
      if (value.trim()) it.objetivo = value.trim(); else delete it.objetivo;
      if (n) { it.series = Number(n[1]); if (it.sets) it.sets = it.sets.slice(0,it.series); } else delete it.series;
    }
    const version = routeVersion; busy = true; await saveSettings({...settings,rutinas}); if (version === routeVersion) renderRoutines(); return true;
  }
  return false;
}

document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || busy) return;
  const version = routeVersion;
  try {
    if (await handleRoutineDayClick(button)) return;
    if (button.dataset.month) { const [y,m] = month.split('-').map(Number); const d = new Date(y,m-1+Number(button.dataset.month),1); month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; await route(); }
    else if (button.dataset.group) { pickerGroup = group = button.dataset.group; renderPickerResults(); }
    else if (button.id === 'all-groups') { pickerGroup = null; renderPickerResults(); }
    else if (button.dataset.slide) { const carousel = $('#exercise-carousel'); carousel.scrollBy({left:Number(button.dataset.slide)*carousel.clientWidth,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}); }
    else if (button.dataset.exercise && selectionTarget) { await selectExercise(button.dataset.exercise); }
    else if (button.dataset.exercise) location.hash = `#ejercicio/${encodeURIComponent(button.dataset.exercise)}`;
    else if (button.dataset.record) { const r = [...monthRows,...exerciseRows].find(r => r.id === button.dataset.record); if (r) { const hash = `#ejercicio/${encodeURIComponent(r.ejercicio)}/${r.id}`; if (location.hash === hash) await route(); else location.hash = hash; } }
    else if (button.id === 'add-series' || button.id === 'copy-series') { const rows = [...document.querySelectorAll('.series')].map(row => Object.fromEntries([...row.querySelectorAll('input')].map(i => [i.dataset.field,i.value]))); const s = button.id === 'copy-series' ? repeatSeries(rows) : {}; $('#series').insertAdjacentHTML('beforeend',seriesHTML(s)); numberSeries(); }
    else if (button.hasAttribute('data-remove')) { button.closest('.series').remove(); if ($('#day-form')) rememberDay(); else numberSeries(); }
    else if (button.id === 'toggle-image' && current.img2) { const img = button.querySelector('img'); img.setAttribute('src',img.getAttribute('src') === current.img ? current.img2 : current.img); }
    else if (button.id === 'rename' || button.id === 'reset-name') {
      const value = button.id === 'rename' ? prompt('Nombre del ejercicio',name(current)) : '';
      if (value === null || (button.id === 'rename' && !value.trim())) return;
      const nombres = {...settings.nombres}; if (value) nombres[current.id] = value.trim(); else delete nombres[current.id];
      busy = true; await saveSettings({...settings,nombres});
      if (version !== routeVersion) return;
      // Preserve the form draft while updating only its heading and rename control.
      $('#app h1').textContent = name(current);
      if (!value) $('#reset-name')?.remove();
      else if (!$('#reset-name')) $('#app h1').parentElement.insertAdjacentHTML('afterend','<button id="reset-name">Volver al nombre original</button>');
    } else if (button.dataset.add) {
      const value = prompt('¿Cómo se llama el ejercicio?'); if (!value?.trim()) return;
      busy = true; await saveSettings({...settings,propios:[...settings.propios,{id:`propio-${crypto.randomUUID()}`,nombre:value.trim(),grupo:button.dataset.add}]});
      if (version === routeVersion) button.dataset.add === 'abru' ? renderAbru() : renderPickerResults();
    } else if (button.dataset.complete) {
      const id = button.dataset.complete; const completed = new Set((settings.nombres.__abru || '').split(',').filter(Boolean));
      completed.has(id) ? completed.delete(id) : completed.add(id);
      busy = true; await saveSettings({...settings,nombres:{...settings.nombres,__abru:[...completed].join(',')}}); if (version === routeVersion) renderAbru(location.hash.split('/')[1] ? decodeURIComponent(location.hash.split('/')[1]) : null);
    } else if (button.id === 'delete-record') {
      if (!confirm('¿Borrar este registro? No se puede recuperar.')) return;
      busy = true; await writeOperation({id:crypto.randomUUID(),kind:'delete',data:{id:editing.id}}); if (version === routeVersion) { drafts.delete(`${renderedUser}:${renderedHash}`); renderedHash = undefined; location.hash = '#mes'; }
    } else if (button.id === 'logout') {
      if (!confirm('¿Cerrar sesión?')) return;
      busy = true; check(await db.auth.signOut()); localStorage.setItem('gym:session-user','null'); drafts.clear(); dayDrafts.clear(); selectionTarget = null; dayDraft = null; user = null; settings = {nombres:{},propios:[],rutinas:[]}; monthRows = exerciseRows = []; current = editing = null; login();
    }
  } catch (error) { fail(error); } finally { busy = false; }
});
document.addEventListener('click',async event => {
  const button = event.target.closest('[data-week],[data-discard]');
  if (!button || !user) return;
  try {
  if (button.dataset.week) weekOffset = Math.min(0,weekOffset+Number(button.dataset.week));
  else { storeQueue(pending().filter(o => o.id !== button.dataset.discard)); await flushQueue(); }
  await route();
  } catch (error) { fail(error); }
});
async function reconnect() { try { await flushQueue(); if (user && !busy && !$('#record-form') && !$('#day-form')) await route(); } catch (error) { fail(error); } }
window.addEventListener('online',reconnect);
document.addEventListener('visibilitychange',() => { if (document.visibilityState === 'visible') reconnect(); });
window.addEventListener('hashchange',route);
async function start() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => message('La instalación sin conexión no está disponible. Podés seguir usando la app.'));
  try {
    const response = await fetch('data/ejercicios.json'); if (!response.ok) throw new Error('No se pudo cargar el catálogo.'); catalog = await response.json();
    const config = window.GYM_CONFIG;
    if (!config?.supabaseUrl || !config?.supabaseKey || Object.values(config).some(v => String(v).includes('PENDIENTE'))) {
      $('#app').innerHTML = '<section class="login"><p class="eyebrow">Tu espacio de entrenamiento</p><h1>Gym está casi listo.</h1><div class="panel"><h2>Falta conectar Supabase</h2><p>Completá <code>public/config.js</code> con la URL y la clave publicable del proyecto. Después recargá esta página para entrar con tu cuenta.</p></div></section>'; return;
    }
    db = window.supabase.createClient(config.supabaseUrl,config.supabaseKey);
    try { user = check(await db.auth.getSession()).session?.user; }
    catch (error) { if (!networkError(error)) throw error; user = JSON.parse(localStorage.getItem('gym:session-user') || 'null'); }
    if (user) localStorage.setItem('gym:session-user',JSON.stringify(user));
    if (user) { await loadSettings(); await flushQueue(); await route(); } else login();
    db.auth.onAuthStateChange((event,session) => { if (event === 'SIGNED_OUT') { localStorage.setItem('gym:session-user','null'); rememberDraft(); renderedHash = undefined; ++routeVersion; user = null; settings = {nombres:{},propios:[],rutinas:[]}; monthRows = exerciseRows = []; login(); } else if (session) { user = session.user; localStorage.setItem('gym:session-user',JSON.stringify(user)); } });
  } catch (error) { fail(error); $('#app').innerHTML = '<h1>No pudimos iniciar Gym</h1><p>Revisá la conexión y recargá la página para volver a intentar.</p><button onclick="location.reload()">Reintentar</button>'; }
}
start();
