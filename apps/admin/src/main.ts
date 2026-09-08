import './styles.css';

type View = 'dashboard' | 'organizations' | 'users' | 'loans' | 'documents' | 'risk' | 'disputes' | 'audit' | 'settings';

const app = document.querySelector<HTMLDivElement>('#app')!;

const nav: Array<[View,string,string]> = [
  ['dashboard','Visión general','⌂'],
  ['organizations','Organizaciones','O'],
  ['users','Usuarios','U'],
  ['loans','Créditos','C'],
  ['documents','Documentos','D'],
  ['risk','Riesgo','!'],
  ['disputes','Disputas','∆'],
  ['audit','Auditoría','A'],
  ['settings','Configuración','⚙']
];

const data = {
  organizations: [
    ['ORG-001824','Inversiones Mendoza','Recife/PE','114','R$ 482.300','ACTIVA'],
    ['ORG-001903','Capital Norte','Olinda/PE','67','R$ 219.800','ACTIVA'],
    ['ORG-002117','Crédito Comercial JF','Jaboatão/PE','29','R$ 91.200','REVISIÓN']
  ],
  users: [
    ['USR-82941','Carlos Alberto Mendoza','Propietario','Inversiones Mendoza','Hoy 14:52','ACTIVO'],
    ['USR-82954','Andrés Salazar','Cobrador','Inversiones Mendoza','Hoy 14:41','ACTIVO'],
    ['USR-83310','Miguel Rojas','Gerente','Capital Norte','Ayer 19:22','ACTIVO']
  ],
  loans: [
    ['CLV-2026-091842','Mercado El Sol','Inversiones Mendoza','R$ 3.000','R$ 1.560','ACTIVO'],
    ['CLV-2026-091843','Barbería Luis','Capital Norte','R$ 1.500','R$ 390','ACTIVO'],
    ['CLV-2026-091844','Tienda Central','Crédito Comercial JF','R$ 2.200','R$ 2.200','REVISIÓN']
  ]
};

function shell(view: View, content: string) {
  return `
  <div class="layout">
    <aside class="sidebar">
      <div class="brand"><div class="brandmark">CB</div><div><strong>Clavos Control</strong><small>Administración de plataforma</small></div></div>
      <nav>${nav.map(([id,label,icon]) => `<button data-view="${id}" class="navitem ${view===id?'active':''}"><span>${icon}</span>${label}</button>`).join('')}</nav>
      <div class="admin-card"><div class="avatar">JG</div><div><b>Superadmin</b><small>Acceso protegido</small></div></div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="search"><span>⌕</span><input placeholder="Buscar CPF, usuario, crédito, organización..." /></div>
        <div class="top-actions"><span class="env">DEMO</span><button class="iconbtn">?</button><button class="iconbtn">⋯</button></div>
      </header>
      <section class="content">${content}</section>
    </main>
  </div>`;
}

const metric = (label:string,value:string,detail:string,tone='') => `<article class="metric ${tone}"><small>${label}</small><strong>${value}</strong><span>${detail}</span></article>`;
const badge = (text:string) => `<span class="badge ${text==='ACTIVO'||text==='ACTIVA'?'ok':text==='REVISIÓN'?'warn':''}">${text}</span>`;

function dashboard(){
  return `<div class="page-head"><div><p class="eyebrow">CONTROL CENTER</p><h1>Visión general</h1><p>Estado operativo consolidado de Clavos Brasil.</p></div><button class="primary">Exportar informe</button></div>
  <div class="metric-grid">
    ${metric('Usuarios registrados','8.431','+83 hoy')}
    ${metric('Organizaciones activas','1.284','72% activación')}
    ${metric('Comerciantes registrados','42.805','+412 esta semana')}
    ${metric('Créditos activos','18.934','R$ 24,3 mi por cobrar')}
    ${metric('Capital en circulación','R$ 19,8 mi','registrado en plataforma')}
    ${metric('Cobrado hoy','R$ 703.840','86,4% de R$ 814.250', 'good')}
  </div>
  <div class="two-col">
    <article class="panel"><div class="panel-head"><div><h2>Operación de hoy</h2><p>Indicadores que requieren atención.</p></div></div>
      <div class="ops"><div><b>142</b><span>Documentos pendientes</span></div><div><b>31</b><span>Disputas abiertas</span></div><div><b>6</b><span>Alertas de seguridad</span></div><div><b>17</b><span>Cuentas suspendidas</span></div></div>
    </article>
    <article class="panel"><div class="panel-head"><div><h2>Riesgo reciente</h2><p>Eventos detectados automáticamente.</p></div><button data-view="risk" class="linkbtn">Ver todos</button></div>
      <div class="feed"><div><i class="critical"></i><div><b>Actividad de consulta anómala</b><span>ORG-001824 · 600 consultas en 24 h</span></div></div><div><i></i><div><b>Documentos potencialmente duplicados</b><span>14 archivos relacionados</span></div></div><div><i></i><div><b>Tasa elevada de disputas</b><span>ORG-002117 · 41%</span></div></div></div>
    </article>
  </div>
  <article class="panel"><div class="panel-head"><div><h2>Actividad administrativa</h2><p>Últimas acciones sensibles registradas.</p></div><button data-view="audit" class="linkbtn">Abrir auditoría</button></div>${auditRows()}</article>`;
}

function tablePage(title:string,desc:string,headers:string[],rows:string[][], action='Abrir'){
  return `<div class="page-head"><div><p class="eyebrow">OPERACIÓN</p><h1>${title}</h1><p>${desc}</p></div><button class="primary">+ Nueva acción</button></div>
  <article class="panel"><div class="filters"><input placeholder="Buscar en ${title.toLowerCase()}..."/><select><option>Todos los estados</option><option>Activo</option><option>En revisión</option><option>Suspendido</option></select><button>Filtros</button></div>
  <div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td>${i===r.length-1?badge(c):c}</td>`).join('')}<td><button class="row-action">${action}</button></td></tr>`).join('')}</tbody></table></div></article>`;
}

function auditRows(){ return `<div class="audit-list">
  <div><time>15:48</time><span><b>Admin JG</b> suspendió ORG-001824</span><em>ORGANIZATION.SUSPEND</em></div>
  <div><time>15:44</time><span><b>Analista #39</b> visualizó DOC-8392</span><em>DOCUMENT.VIEW</em></div>
  <div><time>15:41</time><span><b>Soporte #8</b> inició modo soporte en ORG-002814</span><em>SUPPORT.SESSION</em></div>
  <div><time>15:37</time><span><b>Analista #21</b> corrigió PERSON-9182</span><em>PERSON.CORRECT</em></div>
  </div>`; }

function risk(){return `<div class="page-head"><div><p class="eyebrow">RIESGO</p><h1>Central de riesgo</h1><p>Señales automáticas y casos que requieren investigación.</p></div></div><div class="metric-grid small">${metric('Abiertos','23','casos')}${metric('Alta severidad','6','acción recomendada')}${metric('En investigación','11','asignados')}${metric('Resueltos hoy','18','casos cerrados')}</div><article class="panel"><div class="case"><span class="severity high">ALTA</span><div><b>RISK-002914 · Volumen de consultas atípico</b><p>ORG-001824 generó 600 consultas durante las últimas 24 horas.</p></div><button>Investigar</button></div><div class="case"><span class="severity med">MEDIA</span><div><b>RISK-002915 · Documento repetido</b><p>El mismo hash documental aparece relacionado con 14 perfiles.</p></div><button>Investigar</button></div></article>`}

function documents(){return `<div class="page-head"><div><p class="eyebrow">VERIFICACIÓN</p><h1>Documentos</h1><p>Fila de análisis manual de identidad y evidencias.</p></div></div><div class="metric-grid small">${metric('Pendientes','142','total')}${metric('Prioridad alta','13','casos')}${metric('Corrección solicitada','29','aguardando usuario')}${metric('Analizados hoy','318','documentos')}</div><article class="panel"><div class="case"><span class="docicon">RG</span><div><b>CLV-ID-28482 · Juan Carlos Pérez</b><p>Enviado por Inversiones Mendoza · hace 14 min</p></div><button>Analizar</button></div><div class="case"><span class="docicon">CNH</span><div><b>CLV-ID-28481 · María Fernanda Rojas</b><p>Enviado por Capital Norte · hace 21 min</p></div><button>Analizar</button></div></article>`}

function disputes(){return `<div class="page-head"><div><p class="eyebrow">COMPLIANCE</p><h1>Disputas</h1><p>Contestaciones abiertas por titulares y operaciones bajo revisión.</p></div></div><article class="panel"><div class="case"><span class="severity high">ABIERTA</span><div><b>DSP-10291 · José Pérez</b><p>“No reconozco esta operación.” · CLV-2026-091842</p></div><button>Revisar</button></div><div class="case"><span class="severity med">ESPERA</span><div><b>DSP-10288 · Luis Ramírez</b><p>Aguardando documentación de la organización.</p></div><button>Revisar</button></div></article>`}

function settings(){return `<div class="page-head"><div><p class="eyebrow">SISTEMA</p><h1>Configuración</h1><p>Parámetros globales. Cambios sensibles deberán exigir reautenticación y auditoría.</p></div></div><div class="two-col"><article class="panel"><h2>Límites de plataforma</h2><label>Consultas por día / organización<input value="100"/></label><label>Intentos de acceso<input value="5"/></label><label>Periodo gratuito<input value="6 meses"/></label><button class="primary">Guardar cambios</button></article><article class="panel"><h2>Estado del sistema</h2><div class="system"><div><span>API</span><b>Operativa</b></div><div><span>D1</span><b>Operativo</b></div><div><span>R2</span><b>Operativo</b></div><div><span>Queue</span><b>Operativa</b></div></div></article></div>`}

function render(view: View){
 let content='';
 if(view==='dashboard') content=dashboard();
 if(view==='organizations') content=tablePage('Organizaciones','Gestión de operaciones credoras.',['ID','Organización','Región','Créditos','Volumen','Estado'],data.organizations);
 if(view==='users') content=tablePage('Usuarios','Usuarios, funciones y accesos de la plataforma.',['ID','Nombre','Rol','Organización','Último acceso','Estado'],data.users);
 if(view==='loans') content=tablePage('Créditos','Operaciones registradas en toda la plataforma.',['ID','Tomador','Organización','Principal','Saldo','Estado'],data.loans);
 if(view==='documents') content=documents();
 if(view==='risk') content=risk();
 if(view==='disputes') content=disputes();
 if(view==='audit') content=`<div class="page-head"><div><p class="eyebrow">SISTEMA</p><h1>Auditoría</h1><p>Registro inmutable de acciones administrativas y operativas sensibles.</p></div></div><article class="panel">${auditRows()}</article>`;
 if(view==='settings') content=settings();
 app.innerHTML=shell(view,content);
 document.querySelectorAll<HTMLElement>('[data-view]').forEach(el=>el.onclick=()=>render(el.dataset.view as View));
}

render('dashboard');
