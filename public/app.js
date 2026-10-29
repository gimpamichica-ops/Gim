'use strict';
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const monthLabel = value => new Date(`${value}-02T12:00:00`).toLocaleDateString('es-AR',{month:'long',year:'numeric'}).replace(' de ',' ');
const groups = {piernas:'Piernas',pecho:'Pecho',espalda:'Espalda',hombros:'Hombros',brazos:'Brazos',cardio:'Cardio',abru:'Ayuda a Abru'};
let db, user, catalog = [], settings = {nombres:{},propios:[]}, month = today().slice(0,7), group = 'piernas', monthRows = [], exerciseRows = [], current, editing, busy = false, routeVersion = 0;
const name = e => settings.nombres[e.id] || e.nombre;
const exercises = () => [...catalog,...settings.propios];
const icon = path => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
const implementsList = ['Barra','Mancuerna','Máquina','Polea','Peso corporal'];
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const groupIcons = {piernas:'m8 3 2 8-4 10m10-18-2 8 4 10M10 11h4',pecho:'M4 5v14h16V5M4 12h16M12 5v14',espalda:'M4 4h16l-4 16H8ZM12 4v16',hombros:'M3 16V8l5-4h8l5 4v8M8 4v12m8-12v12',brazos:'m4 17 4-10 4 3 3-6 5 3-3 13H8Z',cardio:'m3 12 4 0 3-8 4 16 3-8h4',abru:'m5 17 6-6 4 2 5-9M14 4h6v6'};
let pickerGroup = null;
const drafts = new Map();
let renderedHash, renderedUser;
function rememberDraft() {
  const form = $('#record-form');
  if (!form?.elements || !renderedHash) return;
  drafts.set(`${renderedUser}:${renderedHash}`,{fecha:form.elements.fecha.value,nota:form.elements.nota.value,implemento:form.querySelector('input[name=implemento]:checked')?.value || '',series:[...form.querySelectorAll('.series')].map(row => Object.fromEntries([...row.querySelectorAll('input')].map(input => [input.dataset.field,input.value])))});
}
function message(text = '') { $('#message').textContent = text; $('#message').hidden = !text; }
function check(result) { if (result.error) throw result.error; return result.data; }
function fail(error) {
  if (error.status === 401 || ['PGRST301','PGRST303'].includes(error.code)) { rememberDraft(); renderedHash = undefined; ++routeVersion; user = null; login(); }
  message(`No pudimos completar la acción. ${error.message || 'Revisá tu conexión e intentá de nuevo.'}`); }
function formatSeries(row, e) { return row.series.map(s => e?.grupo === 'cardio' ? `${s.min} min${s.km ? ` · ${s.km} km` : ''}` : `${s.kg || 0} kg × ${s.reps} ${e?.unidad || 'reps'}`).join(' / '); }
function image(e, cls = '') { return e.img ? `<img class="${cls}" src="${escapeHTML(e.img)}" alt="${escapeHTML(name(e))}" loading="lazy">` : `<div class="initial">${escapeHTML(name(e).charAt(0).toUpperCase())}</div>`; }
function login() {
  $('#nav').hidden = $('#logout').hidden = true;
  $('#app').innerHTML = `<section class="login"><div class="login-logo" aria-hidden="true">GYM<span>&bull;</span></div><p class="eyebrow">Tu espacio de entrenamiento</p><h1>Un día más.<br>Un poco más fuerte.</h1><p class="muted">Entrá para guardar tus entrenamientos y ver cómo avanzás.</p><form id="login"><label>Email<input type="email" name="email" autocomplete="username" required></label><label>Contraseña<input type="password" name="password" autocomplete="current-password" required></label><button class="primary wide">Entrar <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button></form></section>`;
  $('#login').onsubmit = async event => {
    event.preventDefault(); const form = event.target; const button = form.querySelector('button'); button.disabled = true; message();
    try { const result = check(await db.auth.signInWithPassword({email:form.email.value.trim(),password:form.password.value})); user = result.user; await loadSettings(); await route(); }
    catch (error) { fail(error); } finally { button.disabled = false; }
  };
}
async function loadSettings() {
  const owner = user;
  const data = check(await db.from('ajustes').select('nombres,propios').eq('user_id',owner.id).maybeSingle());
  if (user !== owner) return;
  settings = {nombres:data?.nombres || {},propios:data?.propios || []};
}
async function saveSettings(next) {
  const owner = user;
  check(await db.from('ajustes').upsert({user_id:owner.id,...next})); if (user === owner) settings = next;
}
async function route() {
  const version = ++routeVersion;
  if (!user) return;
  rememberDraft();
  message(); $('#nav').hidden = $('#logout').hidden = false;
  const hash = location.hash || '#mes';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active',a.hash === (hash.startsWith('#ejercicio/') ? '#registrar' : hash)));
  try {
    if (hash.startsWith('#ejercicio/')) {
      const [,id,recordId] = hash.split('/');
      const e = exercises().find(item => item.id === decodeURIComponent(id));
      if (!e) throw new Error('Ese ejercicio no existe.');
      const rows = check(await db.from('registros').select('*').eq('ejercicio',e.id).order('fecha',{ascending:false}).order('creado',{ascending:false}));
      if (version !== routeVersion) return;
      current = e; exerciseRows = rows; editing = recordId ? rows.find(row => row.id === recordId) : null;
      if (recordId && !editing) throw new Error('Ese registro ya no existe.');
      renderExercise();
    } else if (hash === '#registrar') { pickerGroup = null; renderPicker(); }
    else if (hash === '#abru') renderAbru();
    else await renderMonth(version);
    if (version === routeVersion) { renderedHash = hash; renderedUser = user.id; window.scrollTo(0,0); }
  } catch (error) { if (version === routeVersion) fail(error); }
}
async function renderMonth(version) {
  const [year,m] = month.split('-').map(Number);
  const end = new Date(year,m,1); const next = `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-01`;
  const rows = check(await db.from('registros').select('*').gte('fecha',`${month}-01`).lt('fecha',next).order('fecha',{ascending:false}).order('creado',{ascending:false}));
  if (version !== routeVersion) return;
  monthRows = rows;
  const days = [...new Set(rows.map(row => row.fecha))];
  $('#app').innerHTML = `<p class="eyebrow">Tu entrenamiento, día a día</p><div class="row between month"><button data-month="-1" aria-label="Mes anterior">‹</button><h1>${escapeHTML(monthLabel(month))}</h1><button data-month="1" aria-label="Mes siguiente">›</button></div><a class="primary button wide" href="#registrar"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> Registrar</a><p class="muted">${rows.length} registro${rows.length === 1 ? '' : 's'} · ${days.length} día${days.length === 1 ? '' : 's'} de movimiento</p>${days.length ? days.map(day => `<section class="day"><div class="dayhead"><span class="date-badge"><strong>${Number(day.slice(-2))}</strong><span>${new Date(`${day}T12:00:00`).toLocaleDateString('es-AR',{weekday:'short'})}</span></span><h2>Tu entrenamiento</h2></div>${rows.filter(row => row.fecha === day).map(row => { const e = exercises().find(e => e.id === row.ejercicio); return `<button class="entry" data-record="${escapeHTML(row.id)}"><div><strong>${escapeHTML(e ? name(e) : row.ejercicio)}${row.implemento ? ` · ${escapeHTML(row.implemento)}` : ''}</strong><small>${row.series.length} serie${row.series.length === 1 ? '' : 's'} · ${e?.grupo === 'cardio' ? `${row.series.reduce((sum,s) => sum + (s.min || 0),0)} min` : `máx ${Math.max(0,...row.series.map(s => s.kg || 0))} kg`}</small><small>${escapeHTML(formatSeries(row,e))}</small>${row.nota ? `<small>${escapeHTML(row.nota)}</small>` : ''}</div><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>`; }).join('')}</section>`).join('') : '<div class="panel empty">Todavía no hay entrenamientos este mes.<br>Tu próximo paso empieza con un registro.</div>'}`;
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
    target.innerHTML = `<p class="muted" role="status">${matches.length} resultado${matches.length === 1 ? '' : 's'}</p>${matches.map(e => `<button class="entry search-result" data-exercise="${escapeHTML(e.id)}">${image(e)}<div><strong>${escapeHTML(name(e))}</strong><span class="chip group-${escapeHTML(e.grupo)}">${escapeHTML(groups[e.grupo])}</span></div></button>`).join('')}`;
  } else if (!pickerGroup) {
    target.innerHTML = `<div class="group-grid">${Object.entries(groups).filter(([id]) => id !== 'abru').map(([id,title]) => `<button class="group-card group-${id}" data-group="${id}">${icon(groupIcons[id])}<strong>${title}</strong><small>${all.filter(e => e.grupo === id).length} ejercicios</small></button>`).join('')}</div>`;
  } else {
    const items = all.filter(e => e.grupo === pickerGroup);
    target.innerHTML = `<button id="all-groups">‹ Todos los grupos</button><h2 class="group-title group-${pickerGroup}">${escapeHTML(groups[pickerGroup])}</h2><div class="carousel" id="exercise-carousel" aria-label="Ejercicios de ${escapeHTML(groups[pickerGroup])}">${items.map(e => `<article class="card">${image(e)}<span class="chip group-${escapeHTML(e.grupo)}">${escapeHTML(groups[e.grupo])}</span><h2>${escapeHTML(name(e))}</h2><button class="primary wide" data-exercise="${escapeHTML(e.id)}">Elegir ${icon('M5 12h14m-6-6 6 6-6 6')}</button></article>`).join('')}</div><div class="carousel-controls"><button data-slide="-1" aria-label="Ejercicio anterior">‹</button><span id="carousel-count" aria-live="polite">${items.length ? 1 : 0} / ${items.length}</span><button data-slide="1" aria-label="Ejercicio siguiente">›</button></div>`;
  }
  if (!query && pickerGroup) target.innerHTML += `<button class="wide add-exercise" data-add="${pickerGroup}">${icon('M12 5v14M5 12h14')} Agregar ejercicio propio</button>`;
  if (!query && pickerGroup) {
    const items = all.filter(e => e.grupo === pickerGroup);
    const carousel = $('#exercise-carousel');
    const update = () => { const index = Math.round(carousel.scrollLeft / Math.max(1,carousel.clientWidth)); $('#carousel-count').textContent = `${items.length ? index+1 : 0} / ${items.length}`; document.querySelector('[data-slide="-1"]').disabled = index === 0; document.querySelector('[data-slide="1"]').disabled = index >= items.length-1; };
    carousel.onscroll = update;
    if (carousel.clientWidth) update();
  }
}
function renderAbru() {
  const completed = (settings.nombres.__abru || '').split(',');
  const steps = exercises().filter(e => e.grupo === 'abru'); const active = steps.find(e => !completed.includes(e.id));
  $('#app').innerHTML = `<p class="eyebrow">De a un paso</p><h1>Ayuda a Abru</h1><div class="abru-progress"><p>${steps.slice(0,9).filter(e => completed.includes(e.id)).length} / 9 pasos superados</p><progress max="9" value="${steps.slice(0,9).filter(e => completed.includes(e.id)).length}" aria-label="Pasos superados"></progress></div><p class="muted">Practicá 2–3 veces por semana y descansá entre días. Pasá de nivel cuando cumplas el criterio del paso. La constancia vale más que apurarse.</p>${steps.map((e,i) => `<section class="panel step ${active?.id === e.id ? 'current' : ''} ${completed.includes(e.id) ? 'done' : ''}"><p class="eyebrow">Paso ${i+1}${active?.id === e.id ? ' · Estás acá' : ''}${completed.includes(e.id) ? ' · Superado ✓' : ''}</p><div class="row">${image(e)}<h2>${escapeHTML(name(e))}</h2></div><p>${escapeHTML(e.como || 'Registrá tus series y avanzá a tu ritmo.')}</p>${e.pasar ? `<p><strong>Pasás al siguiente cuando:</strong> ${escapeHTML(e.pasar)}</p>` : ''}<div class="actions"><button class="primary" data-exercise="${escapeHTML(e.id)}"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> Registrar</button><button data-complete="${escapeHTML(e.id)}">${completed.includes(e.id) ? 'Desmarcar' : '¡Superado!'}</button></div></section>`).join('')}<button class="wide" data-add="abru"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> Agregar ejercicio propio</button>`;
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
  const figure = (regions,x) => '<g transform="translate('+x+' 0)"><g fill="#c9d1cc" stroke="#8a968f"><ellipse cx="50" cy="21" rx="12" ry="15"/><path d="'+body+'"/></g>'+regions.map(([muscle,path]) => '<path class="region '+((e.musculos || []).includes(muscle) ? 'primary-muscle' : (e.secundarios || []).includes(muscle) ? 'secondary' : '')+'" d="'+path+'"><title>'+muscle+'</title></path>').join('')+'</g>';
  return '<section class="panel muscles"><h3>Músculos que trabajás</h3><svg viewBox="0 0 210 230" role="img" aria-label="Mapa muscular de frente y espalda">'+figure(front,0)+figure(back,110)+'<g fill="#a8b6ce" font-size="9" text-anchor="middle"><text x="50" y="226">FRENTE</text><text x="160" y="226">ESPALDA</text></g></svg><p class="legend"><span><span class="swatch primary-swatch"></span>Principal</span><span><span class="swatch secondary-swatch"></span>Secundario</span></p>'+(!(e.musculos || []).length ? '<small>Sin músculos especificados para este ejercicio.</small>' : '')+'</section>';
}

function progress(e,rows) {
  const equipment = [...new Set(rows.map(r => r.implemento || 'Sin implemento'))];
  if (e.grupo !== 'cardio' && equipment.length > 1) return equipment.map(value => '<section><h3>'+escapeHTML(value)+'</h3>'+progress(e,rows.filter(r => (r.implemento || 'Sin implemento') === value))+'</section>').join('');
  const months = [...new Set(rows.map(r => r.fecha.slice(0,7)))].sort();
  if (!months.length) return '<p class="muted">Tu progreso va a aparecer después del primer registro.</p>';
  const stats = months.map(m => {
    const sets = rows.filter(r => r.fecha.startsWith(m)).flatMap(r => r.series);
    const best = sets.reduce((a,s) => !a || s.kg > a.kg || (s.kg === a.kg && s.reps > a.reps) ? s : a,null);
    return {month:m,max:Math.max(0,...sets.map(s => Number(s.kg)||0)),best,volume:sets.reduce((sum,s) => sum+(s.kg||0)*(s.reps||0),0),minutes:sets.reduce((sum,s) => sum+(s.min||0),0)};
  });
  const max = Math.max(1,...stats.map(s => s.max));
  const points = stats.map((s,i) => `${20+i*280/Math.max(1,stats.length-1)},${115-s.max/max*90}`);
  return `${e.grupo !== 'cardio' ? `<svg class="chart" viewBox="0 0 320 150" role="img" aria-label="Peso máximo por mes, de ${escapeHTML(monthLabel(months[0]))} a ${escapeHTML(monthLabel(months.at(-1)))}"><path d="M20 15V120H305" fill="none" stroke="#1d2c4a"/><polyline points="${points.join(' ')}" fill="none" stroke="#60a5fa" stroke-width="3"/>${stats.map((s,i) => `<circle cx="${points[i].split(',')[0]}" cy="${points[i].split(',')[1]}" r="4" fill="#60a5fa"><title>${s.month}: ${s.max} kg</title></circle>`).join('')}<g fill="#a8b6ce" font-size="10"><text x="20" y="140">${months[0]}</text><text x="255" y="140">${months.at(-1)}</text><text x="24" y="14">${max === 1 && !stats.some(s => s.max) ? 0 : max} kg</text></g></svg>` : ''}${stats.reverse().map(s => `<div class="progress-row"><strong>${escapeHTML(monthLabel(s.month))}</strong><p>${e.grupo === 'cardio' ? `${s.minutes} minutos totales` : `Máximo: ${s.max} kg · Mejor serie: ${s.best?.kg || 0} kg × ${s.best?.reps || 0} ${e.unidad || 'reps'}<br>Volumen: ${s.volume.toLocaleString('es-AR')} kg × reps`}</p></div>`).join('')}`;
}
function seriesHTML(s = {}) {
  const cardio = current.grupo === 'cardio';
  if (current.grupo === 'abru' && s.kg === undefined) s = {...s,kg:0};
  return `<div class="series"><span></span><label>${cardio ? 'Minutos' : 'Kg'}<input aria-label="${cardio ? 'Minutos' : 'Kilos'}" data-field="${cardio ? 'min' : 'kg'}" type="text" inputmode="decimal" value="${escapeHTML(cardio ? s.min ?? '' : s.kg ?? '')}" required></label><label>${cardio ? 'Km (opcional)' : current.unidad || 'Reps'}<input aria-label="${cardio ? 'Kilómetros, opcional' : current.unidad || 'Repeticiones'}" data-field="${cardio ? 'km' : 'reps'}" type="text" inputmode="decimal" value="${escapeHTML(cardio ? s.km ?? '' : s.reps ?? '')}" ${cardio ? '' : 'required'}></label><button type="button" data-remove aria-label="Quitar serie">×</button></div>`;
}
function numberSeries() { document.querySelectorAll('.series').forEach((row,i) => { row.firstElementChild.textContent = i+1; row.querySelector('[data-remove]').disabled = document.querySelectorAll('.series').length === 1; }); }
function renderExercise() {
  const e = current; const last = exerciseRows.find(r => r.id !== editing?.id);
  $('#app').innerHTML = `<a class="button back" href="${e.grupo === 'abru' ? '#abru' : '#registrar'}">‹ Ejercicios</a><p class="chip group-${escapeHTML(e.grupo)}">${escapeHTML(groups[e.grupo])}</p><div class="row between"><h1>${escapeHTML(name(e))}</h1><button id="rename" aria-label="Renombrar ejercicio">✎</button></div>${settings.nombres[e.id] ? '<button id="reset-name">Volver al nombre original</button>' : ''}<button class="hero" id="toggle-image" aria-label="Alternar posición inicial y final">${image(e)}</button>${e.img2 ? '<small>Tocá la imagen para ver la otra posición.</small>' : ''}${e.como ? `<p>${escapeHTML(e.como)}</p>` : ''}${muscleMap(e)}<form id="record-form"><h2>${editing ? 'Editar registro' : 'Tu entrenamiento'}</h2>${last ? `<p class="panel">La última vez · ${escapeHTML(last.fecha)}<br><strong>${escapeHTML(formatSeries(last,e))}</strong>${last.implemento ? ` · ${escapeHTML(last.implemento)}` : ''}</p>` : '<p class="muted">Primer registro. Este es tu punto de partida.</p>'}<label>Fecha<input name="fecha" type="date" required value="${editing?.fecha || today()}"></label>${e.grupo !== 'cardio' ? `<fieldset class="equipment"><legend>Implemento <span class="muted">· opcional</span></legend><label><input type="radio" name="implemento" value="" ${!(editing ? editing.implemento : last?.implemento) ? 'checked' : ''}><span>Sin especificar</span></label>${implementsList.map(value => `<label><input type="radio" name="implemento" value="${value}" ${(editing ? editing.implemento : last?.implemento) === value ? 'checked' : ''}><span>${value}</span></label>`).join('')}</fieldset>` : ''}<div id="series">${(editing?.series.length ? editing.series : [{}]).map(seriesHTML).join('')}</div><div class="actions"><button type="button" id="add-series"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> Serie</button><button type="button" id="copy-series">Copiar la última</button></div><label>Nota<textarea name="nota" rows="3" placeholder="¿Cómo te sentiste?">${escapeHTML(editing?.nota || '')}</textarea></label><button class="primary wide" type="submit"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg> Guardar entrenamiento</button>${editing ? '<button type="button" class="danger wide" id="delete-record" style="margin-top:12px">Borrar registro</button>' : ''}</form><section class="panel"><h2>Tu progreso</h2>${progress(e,exerciseRows)}</section><h2>Historial</h2>${exerciseRows.map(r => `<button class="entry" data-record="${escapeHTML(r.id)}"><div><strong>${escapeHTML(r.fecha)}</strong><small>${escapeHTML(name(e))}${r.implemento ? ` · ${escapeHTML(r.implemento)}` : ''}</small><small>${escapeHTML(formatSeries(r,e))}</small></div><span>✎</span></button>`).join('') || '<p class="muted">Todavía no hay registros.</p>'}`;
  const draft = drafts.get(`${user.id}:${location.hash}`);
  if (draft) {
    $('#record-form').elements.fecha.value = draft.fecha;
    $('#record-form').elements.nota.value = draft.nota;
    $('#series').innerHTML = draft.series.map(seriesHTML).join('');
    document.querySelectorAll('input[name=implemento]').forEach(input => input.checked = input.value === (draft.implemento || ''));
  }
  numberSeries(); $('#record-form').onsubmit = saveRecord;
}
async function saveRecord(event) {
  event.preventDefault(); if (busy) return; message();
  const form = event.target; const version = routeVersion; const hash = `${renderedUser}:${renderedHash}`;
  try {
    const series = [...document.querySelectorAll('.series')].map(row => {
      const s = {};
      row.querySelectorAll('input').forEach(input => {
        const raw = input.value.trim().replace(',','.'); const n = Number(raw);
        if (!raw && input.dataset.field === 'km') return;
        if (!raw || !Number.isFinite(n) || n < 0 || (['reps','min'].includes(input.dataset.field) && n <= 0)) throw new Error('Completá las series con números válidos y positivos (kg puede ser 0).');
        s[input.dataset.field] = n;
      }); return s;
    });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.fecha.value)) throw new Error('Elegí una fecha válida.');
    const implemento = current.grupo === 'cardio' ? null : form.querySelector('input[name=implemento]:checked')?.value || null;
    if (implemento && !implementsList.includes(implemento)) throw new Error('Elegí un implemento válido.');
    const payload = {implemento,ejercicio:current.id,fecha:form.fecha.value,series,nota:form.nota.value.trim()};
    busy = true; form.querySelector('[type=submit]').disabled = true;
    check(await (editing ? db.from('registros').update(payload).eq('id',editing.id) : db.from('registros').insert(payload)));
    drafts.delete(hash);
    if (version === routeVersion) renderedHash = undefined;
    if (version === routeVersion) { month = payload.fecha.slice(0,7); location.hash = '#mes'; }
  } catch (error) { if (version === routeVersion) fail(error); } finally { busy = false; form.querySelector('[type=submit]').disabled = false; }
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || busy) return;
  const version = routeVersion;
  try {
    if (button.dataset.month) { const [y,m] = month.split('-').map(Number); const d = new Date(y,m-1+Number(button.dataset.month),1); month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; await route(); }
    else if (button.dataset.group) { pickerGroup = group = button.dataset.group; renderPickerResults(); }
    else if (button.id === 'all-groups') { pickerGroup = null; renderPickerResults(); }
    else if (button.dataset.slide) { const carousel = $('#exercise-carousel'); carousel.scrollBy({left:Number(button.dataset.slide)*carousel.clientWidth,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}); }
    else if (button.dataset.exercise) location.hash = `#ejercicio/${encodeURIComponent(button.dataset.exercise)}`;
    else if (button.dataset.record) { const r = [...monthRows,...exerciseRows].find(r => r.id === button.dataset.record); if (r) { const hash = `#ejercicio/${encodeURIComponent(r.ejercicio)}/${r.id}`; if (location.hash === hash) await route(); else location.hash = hash; } }
    else if (button.id === 'add-series' || button.id === 'copy-series') { const last = [...document.querySelectorAll('.series')].at(-1); const s = {}; if (button.id === 'copy-series') last.querySelectorAll('input').forEach(i => s[i.dataset.field] = i.value); $('#series').insertAdjacentHTML('beforeend',seriesHTML(s)); numberSeries(); }
    else if (button.hasAttribute('data-remove')) { button.closest('.series').remove(); numberSeries(); }
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
      busy = true; await saveSettings({...settings,nombres:{...settings.nombres,__abru:[...completed].join(',')}}); if (version === routeVersion) renderAbru();
    } else if (button.id === 'delete-record') {
      if (!confirm('¿Borrar este registro? No se puede recuperar.')) return;
      busy = true; check(await db.from('registros').delete().eq('id',editing.id)); if (version === routeVersion) { drafts.delete(`${renderedUser}:${renderedHash}`); renderedHash = undefined; location.hash = '#mes'; }
    } else if (button.id === 'logout') {
      busy = true; check(await db.auth.signOut()); drafts.clear(); user = null; settings = {nombres:{},propios:[]}; monthRows = exerciseRows = []; current = editing = null; login();
    }
  } catch (error) { fail(error); } finally { busy = false; }
});
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
    user = check(await db.auth.getSession()).session?.user;
    if (user) { await loadSettings(); await route(); } else login();
    db.auth.onAuthStateChange((event,session) => { if (event === 'SIGNED_OUT') { rememberDraft(); renderedHash = undefined; ++routeVersion; user = null; settings = {nombres:{},propios:[]}; monthRows = exerciseRows = []; login(); } else if (session) user = session.user; });
  } catch (error) { fail(error); $('#app').innerHTML = '<h1>No pudimos iniciar Gym</h1><p>Revisá la conexión y recargá la página para volver a intentar.</p><button onclick="location.reload()">Reintentar</button>'; }
}
start();
