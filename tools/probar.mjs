import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
const root = new URL('../public/',import.meta.url);
const read = path => readFileSync(new URL(path,root),'utf8');
const exists = path => assert.ok(existsSync(new URL(path,root)),`Falta ${path}`);
const catalog = JSON.parse(read('data/ejercicios.json'));
assert.equal(new Set(catalog.map(e=>e.id)).size,catalog.length,'IDs duplicados');
for (const e of catalog) { assert.ok(e.id && e.nombre && e.grupo); for (const field of ['img','img2']) if (e[field]) exists(e[field]); }
assert.equal(catalog.filter(e=>e.grupo==='abru').length,9);
for (const id of ['abru-colgada','abru-isometrica']) assert.equal(catalog.find(e=>e.id===id).unidad,'seg');
for (const match of read('index.html').matchAll(/(?:src|href)="([^"#]+)"/g)) exists(match[1]);
const worker = read('sw.js');
const shell = JSON.parse(worker.match(/const SHELL = (\[[^;]+\])/)[1].replaceAll("'",'"'));
shell.forEach(exists);
for (const path of ['app.js','sw.js']) execFileSync(process.execPath,['--check',fileURLToPath(new URL(path,root))]);
for (const icon of JSON.parse(read('manifest.webmanifest')).icons) {
  exists(icon.src); const png = readFileSync(new URL(icon.src,root));
  assert.equal(png.subarray(1,4).toString(),'PNG'); assert.equal(png.readUInt32BE(16),Number(icon.sizes.split('x')[0]));
}
const elements = new Map();
const element = selector => { if (!elements.has(selector)) elements.set(selector,{innerHTML:'',textContent:'',hidden:false}); return elements.get(selector); };
const context = vm.createContext({console,URL,Date,Set,Map,Number,String,Math,JSON,navigator:{},location:{hash:'#mes'},document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},window:{GYM_CONFIG:{supabaseUrl:'PENDIENTE',supabaseKey:'PENDIENTE'},addEventListener(){},scrollTo(){}},fetch:async()=>({ok:true,json:async()=>catalog})});
vm.runInContext(read('app.js').replace(/start\(\);\s*$/,''),context);
const run = code => vm.runInContext(code,context);
assert.equal(run(`escapeHTML('<img onerror="x">')`),'&lt;img onerror=&quot;x&quot;&gt;');
assert.equal(run(`formatSeries({series:[{kg:40,reps:10}]},{grupo:'piernas'})`),'40 kg × 10 reps');
assert.equal(run(`formatSeries({series:[{kg:0,reps:30}]},{grupo:'abru',unidad:'seg'})`),'0 kg × 30 seg');
assert.equal(run(`formatSeries({series:[{min:20,km:3}]},{grupo:'cardio'})`),'20 min · 3 km');
assert.ok(run(`progress({grupo:'piernas'},[{fecha:'2026-10-01',series:[{kg:40,reps:10},{kg:50,reps:5}]}])`).includes('650 kg × reps'));
assert.ok(run(`progress({grupo:'cardio'},[{fecha:'2026-10-01',series:[{min:20},{min:10}]}])`).includes('30 minutos totales'));
await run('start()'); assert.ok(element('#app').innerHTML.includes('Falta conectar Supabase'));
run(`catalog = ${JSON.stringify(catalog)}; renderAbru('Dominadas')`);
assert.equal((element('#app').innerHTML.match(/data-complete=/g)||[]).length,9);
assert.ok(element('#app').innerHTML.includes('Estás acá'));
run(`settings.nombres.__abru='abru-colgada'; renderAbru('Dominadas')`);
assert.ok(element('#app').innerHTML.includes('Paso 2 · Estás acá'));
run(`renderPicker()`); assert.ok(element('#picker-results').innerHTML.includes('Piernas'));
run(`pickerGroup='piernas'; renderPickerResults()`); assert.ok(element('#picker-results').innerHTML.includes('Sentadilla'));
// A failed write must leave both the form draft and the current route intact.
run(`current={id:'test',grupo:'piernas'}; db={from:()=>({insert:async()=>({error:new Error('sin conexión')})})}`);
const submit = {disabled:false};
const inputs = [{value:'40,5',dataset:{field:'kg'}},{value:'10',dataset:{field:'reps'}}];
context.document.querySelectorAll = selector => selector === '.series' ? [{querySelectorAll:()=>inputs}] : [];
context.testForm = {fecha:{value:'2026-10-28'},nota:{value:'Mi nota'},querySelector:()=>submit};
await run('saveRecord({preventDefault(){},target:testForm})');
assert.equal(context.testForm.nota.value,'Mi nota'); assert.equal(inputs[0].value,'40,5'); assert.equal(context.location.hash,'#mes'); assert.equal(submit.disabled,false);
assert.ok(element('#message').textContent.includes('sin conexión'));
let written;
context.capture = payload => { written = payload; return {error:null}; };
run(`db={from:()=>({insert:async payload=>capture(payload),update:payload=>({eq:async()=>capture(payload)})})}`);
await run('saveRecord({preventDefault(){},target:testForm})');
assert.equal(written.series[0].kg,40.5); assert.equal(written.series[0].reps,10);
assert.equal(context.location.hash,'#mes');
run(`editing={id:'registro-existente'}`);
await run('saveRecord({preventDefault(){},target:testForm})');
assert.equal(written.nota,'Mi nota');
inputs[0].value='-10'; written=undefined;
await run('saveRecord({preventDefault(){},target:testForm})');
assert.equal(written,undefined); assert.ok(element('#message').textContent.includes('números válidos'));
inputs[0].value='';
await run('saveRecord({preventDefault(){},target:testForm})');
assert.equal(written,undefined);
run(`user={id:'usuario'}; db={from:()=>({upsert:async()=>({error:new Error('sin conexión')})})}`);
await assert.rejects(run(`saveSettings({nombres:{otro:'Nuevo'},propios:[]})`));
assert.equal(run('settings.nombres.otro'),undefined);
console.log(`OK · ${catalog.length} ejercicios, imágenes, referencias, íconos, sintaxis y pruebas de cálculos/guardado.`);

// Route responses must not replace a newer screen, even when the old request fails.
assert.equal(run("monthLabel('2026-10')"),'octubre 2026');
context.scrolls = 0;
context.window.scrollTo = (x,y) => { assert.equal(x,0); assert.equal(y,0); context.scrolls++; };
context.pending = [];
context.deferred = () => new Promise(resolve => context.pending.push(resolve));
run("user={id:'usuario'}; db={from:table=>table === 'dias' ? {select:()=>({eq:()=>({order:async()=>({data:[]})})})} : ({select:()=>({gte:()=>({lt:()=>({order:()=>({order:()=>deferred()})})})})})}; location.hash='#mes'");
const oldRoute = run('route()'); await new Promise(resolve=>setImmediate(resolve));
context.location.hash='#registrar'; await run('route()');
const picker = element('#app').innerHTML;
context.pending.shift()({error:new Error('error viejo')}); await oldRoute;
assert.equal(element('#app').innerHTML,picker);
assert.equal(element('#message').textContent,'');
assert.equal(context.scrolls,1);
context.location.hash='#mes';
const monthRoute = run('route()'); await new Promise(resolve=>setImmediate(resolve));
context.pending.shift()({data:[{id:'uno',ejercicio:'test',fecha:'2026-10-01',series:[{kg:1,reps:1}],nota:'<img src=x onerror=alert(1)>'}]});
await monthRoute;
assert.ok(element('#app').innerHTML.includes('1 registro · 1 día de movimiento'));
assert.ok(!element('#app').innerHTML.includes('<img src=x'));
assert.ok(element('#app').innerHTML.includes('&lt;img src=x'));
run("settings.propios=[{id:'xss',grupo:'piernas',nombre:'<svg onload=alert(1)>'}]; pickerGroup='piernas'; renderPicker()");
assert.ok(!element('#picker-results').innerHTML.includes('<svg onload'));
assert.ok(element('#picker-results').innerHTML.includes('&lt;svg onload'));
// A completed save must not redirect the user away from their new route.
inputs[0].value='40';
run("editing=null; current={id:'test',grupo:'piernas'}; db={from:()=>({insert:()=>deferred()})}");
const saving = run('saveRecord({preventDefault(){},target:testForm})');
context.location.hash='#abru'; await run('route()');
context.pending.shift()({error:null}); await saving;
assert.equal(context.location.hash,'#abru');
// Drafts are isolated by account and retain unparsed input.
context.draftForm = {elements:{fecha:{value:'2026-10-28'},nota:{value:'borrador'}},querySelector:()=>null,querySelectorAll:()=>[{querySelectorAll:()=>inputs}]};
elements.set('#record-form',context.draftForm);
run("renderedHash='#ejercicio/test'; renderedUser='usuario'; rememberDraft()");
assert.equal(run("drafts.get('usuario:#ejercicio/test').series[0].kg"),'40');
assert.equal(run("drafts.get('otro:#ejercicio/test')"),undefined);
assert.ok(/const CACHE = 'gym-v\d+'/.test(worker));
assert.ok(worker.includes("cache:'no-cache'"));
console.log('OK · scroll, singular, XSS, carreras de navegación, borradores por cuenta y caché v3.');

run("fail({status:401,message:'Sesion vencida'})");
assert.equal(run('user'),null);
assert.equal(run("drafts.get('usuario:#ejercicio/test').nota"),'borrador');
context.document.querySelectorAll = () => [];
context.location.hash='#ejercicio/test';
run("user={id:'usuario'}; current={id:'test',nombre:'Prueba',grupo:'piernas'}; editing=null; exerciseRows=[]; renderExercise()");
assert.equal(context.draftForm.elements.nota.value,'borrador');
assert.ok(element('#series').innerHTML.includes('value="40"'));
assert.ok(element('#app').innerHTML.includes('M\u00fasculos que trabaj\u00e1s'));
console.log('OK - sesion vencida y restauracion del formulario.');

// Presentation checks for the design brief.
run("settings.nombres.__abru='abru-colgada'; renderAbru('Dominadas')");
assert.ok(element('#app').innerHTML.includes('1 / 9 pasos superados'));
assert.ok(element('#app').innerHTML.includes('value="1"'));
run("pickerGroup='piernas'; renderPicker()");
assert.ok(element('#picker-results').innerHTML.includes('chip group-piernas'));
const map = run("muscleMap({musculos:['chest'],secundarios:['biceps']})");
assert.ok(map.includes('primary-muscle')); assert.ok(map.includes('region secondary'));
assert.ok(map.includes('primary-swatch')); assert.ok(map.includes('#c9d1cc'));
assert.equal((read('index.html').match(/class="icon"/g)||[]).length,5);
assert.ok(read('styles.css').includes('.primary-muscle{fill:#ff6a3d'));
assert.ok(read('styles.css').includes('.secondary{fill:#38bdf8'));
console.log('OK - presentacion, mapa, chips, iconos y progreso Abru.');

// All group exercises, including custom ones, remain reachable; search ignores accents/case.
run("settings.propios=[{id:'propio-test',nombre:'Extensión única',grupo:'piernas'}]; pickerGroup=null; renderPicker()");
assert.equal((element('#picker-results').innerHTML.match(/data-group=/g)||[]).length,7);
run("pickerGroup='piernas'; renderPickerResults()");
assert.equal((element('#picker-results').innerHTML.match(/data-exercise=/g)||[]).length,catalog.filter(e=>e.grupo==='piernas').length+1);
assert.ok(element('#picker-results').innerHTML.includes('propio-test'));
element('#exercise-search').value='EXTENSION UNICA'; run('renderPickerResults()');
assert.ok(element('#picker-results').innerHTML.includes('propio-test'));
assert.equal(run("normalize('MáQUINA')"),'maquina');
const separated = run("progress({grupo:'pecho'},[{fecha:'2026-10-01',implemento:'Barra',series:[{kg:60,reps:5}]},{fecha:'2026-10-02',implemento:'Mancuerna',series:[{kg:20,reps:10}]}])");
assert.ok(separated.includes('<h3>Barra</h3>')); assert.ok(separated.includes('<h3>Mancuerna</h3>'));
assert.ok(!separated.includes('500 kg × reps'));
// Equipment is saved, validated and omitted for cardio.
elements.delete('#record-form');
context.testForm.querySelector=selector=>selector.includes('implemento') ? {value:'Mancuerna'} : submit;
context.document.querySelectorAll=selector=>selector==='.series' ? [{querySelectorAll:()=>inputs}] : [];
run("editing=null; current={id:'test',grupo:'pecho'}; db={from:()=>({insert:async payload=>capture(payload)})}");
await run('saveRecord({preventDefault(){},target:testForm})'); assert.equal(written.implemento,'Mancuerna');
context.testForm.querySelector=selector=>selector.includes('implemento') ? {value:'inválido'} : submit;
written=undefined; await run('saveRecord({preventDefault(){},target:testForm})'); assert.equal(written,undefined);
run("current={id:'cardio',grupo:'cardio'}");
inputs[0]={value:'20',dataset:{field:'min'}}; inputs[1]={value:'',dataset:{field:'km'}};
await run('saveRecord({preventDefault(){},target:testForm})'); assert.equal(written.implemento,null);
console.log('OK · grupos, carrusel completo, búsqueda, progreso y guardado por implemento.');

// Counter follows swipes and stops arrows at either end.
element('#exercise-search').value='';
Object.assign(element('#exercise-carousel'),{clientWidth:343,scrollLeft:0});
run("pickerGroup='piernas'; renderPickerResults()");
assert.equal(element('[data-slide="-1"]').disabled,true);
element('#exercise-carousel').scrollLeft=686;
element('#exercise-carousel').onscroll();
assert.ok(element('#carousel-count').textContent.startsWith('3 / '));
assert.equal(element('[data-slide="-1"]').disabled,false);
element('#exercise-carousel').scrollLeft=343*(catalog.filter(e=>e.grupo==='piernas').length);
element('#exercise-carousel').onscroll();
assert.equal(element('[data-slide="1"]').disabled,true);
// New sessions remember the last equipment; editing preserves the record's equipment.
context.document.querySelectorAll=()=>[];
run("current={id:'test',nombre:'Press',grupo:'pecho'}; exerciseRows=[{id:'last',fecha:'2026-10-01',implemento:'Mancuerna',series:[{kg:20,reps:10}]}]; editing=null; renderExercise()");
assert.ok(element('#app').innerHTML.includes('value="Mancuerna" checked'));
assert.ok(element('#app').innerHTML.includes('Press · Mancuerna'));
run("editing={id:'edit',fecha:'2026-10-02',implemento:'Barra',series:[{kg:60,reps:5}]}; renderExercise()");
assert.ok(element('#app').innerHTML.includes('value="Barra" checked'));
console.log('OK · contador, flechas y selección inicial del implemento.');
// Calendar, routine management and program grouping.
context.document.querySelectorAll=()=>[];
elements.delete('#record-form');
run("month='2026-02'; settings.rutinas=[{id:'d1',nombre:'Piernas',ejercicios:['Barbell_Squat']}]");
const calendar=run("summaryHTML([{fecha:'2026-02-03',fue:true,rutina:'d1'},{fecha:'2026-02-04',fue:false}])");
assert.equal((calendar.match(/data-day=/g)||[]).length,28);
assert.ok(calendar.includes('D1')); assert.ok(calendar.includes('absent')); assert.ok(calendar.includes('Piernas'));
run('renderRoutines()'); assert.ok(element('#app').innerHTML.includes('Sentadilla')); assert.ok(element('#app').innerHTML.includes('data-routine-move'));
run('renderAbru()'); assert.equal((element('#app').innerHTML.match(/class="panel program"/g)||[]).length,1); assert.ok(element('#app').innerHTML.includes('1/9 superados'));
run("settings.propios.push({id:'otro-programa',nombre:'Otro',grupo:'abru',programa:'Otro programa'}) ; renderAbru()");
assert.equal((element('#app').innerHTML.match(/class="panel program"/g)||[]).length,2);
assert.equal(run("parseDaySeries([{}, {kg:'',reps:''}]).length"),0);
assert.equal(run("parseDaySeries([{kg:'0',reps:'10'}])[0].kg"),0);
assert.throws(()=>run("parseDaySeries([{kg:'-1',reps:'10'}])"));
assert.throws(()=>run("parseDaySeries([{kg:'10',reps:''}])"));
// Retry a partial day save: update the exercise already written, insert only the missing one.
const stored = new Map(), writes = [];
let failAttendance = true;
context.dayDb = {from(table) {
  const filters={};
  const query={select(){return this},eq(key,value){filters[key]=value;return this},then(resolve){resolve({data:stored.has(filters.ejercicio)?[{id:stored.get(filters.ejercicio).id}]:[]})}};
  return {...query,update(payload){writes.push(['update',payload]);stored.set(payload.ejercicio,payload);return {eq(){return this},then(resolve){resolve({error:null})}}},insert:async payload=>{writes.push(['insert',payload]);stored.set(payload.ejercicio,payload);return {error:null}},upsert:async payload=>{writes.push(['day',payload]);return failAttendance?{error:new Error('fallo asistencia')}:{error:null}},delete(){return {eq(){return this},then(resolve){resolve({error:null})}}}};
}};
context.dayData={owner:'usuario',fecha:'2026-10-28',fue:true,rutina:'d1',comentario:'nota',entries:[{ejercicio:'Barbell_Squat',implemento:'Barra',nota:'nota ejercicio',series:[{kg:'40,5',reps:'10'}]},{ejercicio:'sin-series',implemento:'',nota:'',series:[{}]}]};
run('db=dayDb'); await assert.rejects(run('persistDay(dayData)'),/fallo asistencia/);
assert.equal(context.dayData.entries[0].series[0].kg,'40,5');
failAttendance=false; await run('persistDay(dayData)');
assert.equal(writes.filter(([kind])=>kind==='insert').length,1);
assert.equal(writes.filter(([kind])=>kind==='update').length,1);
assert.equal(stored.get('Barbell_Squat').series[0].kg,40.5);
assert.equal(writes.at(-1)[1].user_id,'usuario');
context.dayData.fue=null; await run('persistDay(dayData)');
// Prefill every exercise, retain existing entries, never share history across day drafts.
run("dayDraft={fecha:'2026-10-28',rutina:'d1',entries:[],history:[{ejercicio:'Barbell_Squat',fecha:'2026-10-01',implemento:'Barra',series:[{kg:50,reps:8}]}]}; addRoutineEntries(); addRoutineEntries()");
assert.equal(run('dayDraft.entries.length'),1); assert.equal(run('dayDraft.entries[0].series[0].kg'),50);
assert.ok(read('index.html').includes('<span>Resumen</span>')); assert.ok(read('index.html').includes('<span>Rutinas</span>'));
console.log('OK · calendario, rutinas, programas, validación, precarga y reintentos del día sin duplicados.');
