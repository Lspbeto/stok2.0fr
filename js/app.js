// Interface do STOK: estoque, entregas, usuários, histórico e relatórios.
const API = window.STOK_CONFIG.API_URL.replace(/\/$/, "");
let token = localStorage.getItem("stok_token"), currentUser = null, cachedMovements = [], cachedSectors = [], selectedCompanyId = localStorage.getItem("stok_company_id") || "";
const $ = id => document.getElementById(id);
function message(text, error=false) { $("message").textContent=text; $("message").style.color=error?"#b42318":"#167044"; }
async function api(path, options={}) {
  const response=await fetch(API+path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),...(selectedCompanyId?{"X-Company-Id":selectedCompanyId}:{}),...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.message||"Não foi possível concluir a operação.");
  return data;
}
function showPending(user) {
  currentUser=user; $("login").hidden=true; $("temporaryScreen").hidden=true; $("registerScreen").hidden=true; $("forgotScreen").hidden=true; $("resetScreen").hidden=true; $("app").hidden=true; $("pendingScreen").hidden=false;
  $("pendingMessage").textContent="Olá, "+user.name+". Sua solicitação para a empresa selecionada está aguardando aprovação. Você não pode acessar o estoque, entregas ou relatórios enquanto não for aprovado.";
}
async function refreshPendingStatus(){
 try{const user=await api("/auth/me");if(user.approvalStatus==="approved"){ $("pendingScreen").hidden=true; showLoggedIn(user); message("Acesso aprovado. Bem-vindo ao STOK.");}else if(user.approvalStatus==="rejected"){$("pendingMessage").textContent="Sua solicitação foi recusada. Entre em contato com o administrador da empresa."; }else{$("pendingMessage").textContent="Sua solicitação continua aguardando aprovação do administrador.";}}
 catch(err){$("pendingMessage").textContent=err.message;}
}
function showLoggedIn(user) {
  currentUser=user; $("pendingScreen").hidden=true; $("login").hidden=true; $("temporaryScreen").hidden=true; $("registerScreen").hidden=true; $("forgotScreen").hidden=true; $("resetScreen").hidden=true; $("app").hidden=false;
  const isSuperAdmin=user.role==="superadmin";
  const isAdmin=["admin","superadmin"].includes(user.role);
  $("welcome").textContent="Olá, "+user.name+" ("+(isSuperAdmin?"Administrador geral STOK":user.role)+")";
  $("createTab").hidden=!isAdmin; $("companies").hidden=!isSuperAdmin; $("sectors").hidden=!isAdmin||(isSuperAdmin&&!selectedCompanyId); $("users").hidden=!isAdmin||(isSuperAdmin&&!selectedCompanyId); $("databaseTab").hidden=!isAdmin; $("chatTab").hidden=!isAdmin; $("approvalsTab").hidden=!isAdmin; $("databaseTools").hidden=true;
  const adminRoleOption=$("userRole").querySelector('option[value="admin"]'); if(adminRoleOption)adminRoleOption.hidden=!isSuperAdmin; if(!isSuperAdmin)$("userRole").value="operador";
  $("deliveryForm").hidden=user.role!=="admin";
  if(isAdmin){loadChatCompanies();loadPendingUsers();}
  if(isSuperAdmin){
    loadCompaniesList();
    // O administrador geral precisa escolher a empresa antes de consultar dados.
    $("globalCompanySelect")?.closest("label")?.remove();
    loadGlobalCompanySelector();
  }else{
    selectedCompanyId="";
    localStorage.removeItem("stok_company_id");
    loadSectors();
    loadProducts();
  }
}
// Configuração inicial: cria o primeiro administrador geral somente se a API confirmar que não existe um.
$("firstSetupForm").addEventListener("submit", async e => {
  e.preventDefault();
  const password = $("firstAdminPassword").value;
  if (password !== $("firstAdminPasswordConfirm").value) {
    message("As senhas não conferem.", true);
    return;
  }
  const submit = e.submitter;
  if (submit) submit.disabled = true;
  try {
    const response = await fetch(API + "/auth/setup-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: $("firstAdminName").value,
        email: $("firstAdminEmail").value,
        password
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Não foi possível criar o administrador geral.");
    token = data.token;
    localStorage.setItem("stok_token", token);
    $("firstSetupScreen").hidden = true;
    e.target.reset();
    showLoggedIn(data.user);
    message("Administrador geral criado com sucesso. Agora cadastre as empresas de demonstração.");
  } catch (err) {
    message(err.message, true);
  } finally {
    if (submit) submit.disabled = false;
  }
});

// Mostrar/ocultar senha somente no campo da própria tela; a senha nunca é enviada para outro local.
document.querySelectorAll("[data-toggle-password]").forEach(button => {
  button.addEventListener("click", () => {
    const field = $(button.dataset.togglePassword);
    if (!field) return;
    const visible = field.type === "password";
    field.type = visible ? "text" : "password";
    button.textContent = visible ? "Ocultar" : "Mostrar";
    button.setAttribute("aria-label", visible ? "Ocultar senha" : "Mostrar senha");
    button.setAttribute("aria-pressed", String(visible));
  });
});

// O identificador da empresa é sugerido automaticamente a partir do nome.
$("companyName").addEventListener("input", () => {
  $("companySlug").value = $("companyName").value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
});

$("companyForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    const data = await api("/companies", {
      method: "POST",
      body: JSON.stringify({
        name: $("companyName").value,
        slug: $("companySlug").value,
        adminName: $("companyAdminName").value,
        email: $("companyAdminEmail").value,
        password: $("companyAdminPassword").value
      })
    });
    e.target.reset();
    await loadCompaniesList();
    await loadGlobalCompanySelector();
    message("Empresa e administrador cadastrados. Setores Estoque e Administração também foram criados.");
  } catch (err) { message(err.message, true); }
});

async function loadCompaniesList() {
  try {
    const companies = await api("/companies");
    const box = $("companyList");
    box.replaceChildren();
    if (!companies.length) { box.textContent = "Nenhuma empresa cadastrada."; return; }
    companies.forEach(company => {
      const item = document.createElement("p");
      item.textContent = company.name + " (" + company.slug + ") — " + (company.active === false ? "inativa" : "ativa");
      box.appendChild(item);
    });
  } catch (err) { message(err.message, true); }
}

$("loginForm").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/auth/login",{method:"POST",body:JSON.stringify({email:$("email").value,password:$("password").value})});token=d.token;localStorage.setItem("stok_token",token);if(d.pending||d.user.approvalStatus==="pending"){showPending(d.user);message(d.message||"Aguardando aprovação.");}else{showLoggedIn(d.user);message("Login realizado.");}}catch(err){message(err.message,true);}});
// Alterna entre login e cadastro mantendo o mesmo cartão visual.
$("showRegister").addEventListener("click",()=>{$("login").hidden=true;$("registerScreen").hidden=false;});
$("showTemporary").addEventListener("click",()=>{$("login").hidden=true;$("temporaryScreen").hidden=false;});
$("backFromTemporary").addEventListener("click",()=>{$("temporaryScreen").hidden=true;$("login").hidden=false;});
$("temporaryForm").addEventListener("submit",async e=>{e.preventDefault();const submit=e.submitter;if(submit)submit.disabled=true;try{const d=await api("/auth/temporary-register",{method:"POST",body:JSON.stringify({name:$("temporaryCompanyName").value,responsible:$("temporaryResponsible").value,email:$("temporaryEmail").value,password:$("temporaryPassword").value})});token=d.token;localStorage.setItem("stok_token",token);$("temporaryScreen").hidden=true;e.target.reset();showLoggedIn(d.user);message(d.message);alert(d.message+"\n\nPrazo final: "+new Date(d.company.expiresAt).toLocaleString("pt-BR"));}catch(err){message(err.message,true);}finally{if(submit)submit.disabled=false;}});
$("backToLogin").addEventListener("click",()=>{$("registerScreen").hidden=true;$("login").hidden=false;});
$("showForgotPassword").addEventListener("click",()=>{$("login").hidden=true;$("forgotScreen").hidden=false;});
$("backFromForgot").addEventListener("click",()=>{$("forgotScreen").hidden=true;$("login").hidden=false;});
$("forgotForm").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/auth/forgot-password",{method:"POST",body:JSON.stringify({email:$("forgotEmail").value})});message(d.message);$("forgotScreen").hidden=true;$("login").hidden=false;}catch(err){message(err.message,true);}});
let resetToken=new URLSearchParams(window.location.search).get("reset");
if(resetToken){token=null;localStorage.removeItem("stok_token");$("app").hidden=true;$("login").hidden=true;$("registerScreen").hidden=true;$("temporaryScreen").hidden=true;$("forgotScreen").hidden=true;$("resetScreen").hidden=false;}
$("resetForm").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/auth/reset-password",{method:"POST",body:JSON.stringify({token:resetToken,password:$("resetPassword").value})});message(d.message);window.history.replaceState({},"",window.location.pathname);$("resetScreen").hidden=true;$("login").hidden=false;resetToken=null;e.target.reset();}catch(err){message(err.message,true);}});
$("registerForm").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/auth/register",{method:"POST",body:JSON.stringify({name:$("registerName").value,email:$("registerEmail").value,password:$("registerPassword").value,sector:$("registerSector").value,companyId:$("registerCompany").value})});token=d.token;localStorage.setItem("stok_token",token);showPending(d.user);e.target.reset();message(d.message||"Solicitação enviada para aprovação.");}catch(err){message(err.message,true);}});
$("logout").addEventListener("click",()=>{token=null;currentUser=null;localStorage.removeItem("stok_token");$("app").hidden=true;$("registerScreen").hidden=true;$("temporaryScreen").hidden=true;$("forgotScreen").hidden=true;$("resetScreen").hidden=true;$("login").hidden=false;});
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{
  const companyRequired=["products","deliveries","history"].includes(b.dataset.tab);
  if(currentUser?.role==="superadmin"&&companyRequired&&!selectedCompanyId){
    message("Administrador geral: escolha uma empresa no campo Empresa em administração antes de abrir esta área.",true);
    return;
  }
  document.querySelectorAll(".tab").forEach(x=>x.hidden=x.id!==b.dataset.tab);
  document.querySelectorAll(".tab-button").forEach(x=>x.classList.toggle("active",x===b));
  if(b.dataset.tab==="history")loadHistory();
  if(b.dataset.tab==="products")loadProducts();
  if(b.dataset.tab==="deliveries")loadDeliveries();
  if(b.dataset.tab==="create"){loadSectors();if(currentUser?.role==="superadmin")loadCompaniesList();}
  if(b.dataset.tab==="databaseTools"){loadRegistryReport();loadDiagnostics();}
  if(b.dataset.tab==="chat")loadChatMessages();
  if(b.dataset.tab==="approvals")loadPendingUsers();
}));
// O administrador geral escolhe a empresa cujos dados deseja administrar.
async function loadGlobalCompanySelector(){
 try{
  const previousSelection=selectedCompanyId;selectedCompanyId="";
  const companies=await api("/companies");
   // O seletor geral de empresa é a única referência para os cadastros do administrador geral.
  let select=$("globalCompanySelect");
  if(!select){
   select=document.createElement("select");select.id="globalCompanySelect";select.setAttribute("aria-label","Empresa em administração");
   const label=document.createElement("label");label.id="globalCompanyLabel";label.className="global-company-label";label.textContent="ADMINISTRAÇÃO GERAL — Empresa em administração: ";label.appendChild(select);
   $("welcome").after(label);
   select.addEventListener("change",()=>{
    selectedCompanyId=select.value;localStorage.setItem("stok_company_id",selectedCompanyId);
    $("sectors").hidden=!selectedCompanyId; $("users").hidden=!selectedCompanyId;
    if(!selectedCompanyId){message("Selecione uma empresa para acessar os dados e cadastrar setores ou usuários.");return;}
    loadSectors();loadProducts();loadHistory();loadDeliveries();
   });
  }
  select.replaceChildren();
  const empty=document.createElement("option");empty.value="";empty.textContent="Selecione uma empresa";select.appendChild(empty);
  companies.filter(c=>c.active!==false).forEach(c=>{const o=document.createElement("option");o.value=c._id;o.textContent=c.name;select.appendChild(o);});
  if(companies.some(c=>c._id===previousSelection&&c.active!==false)){selectedCompanyId=previousSelection;select.value=selectedCompanyId;}
  else {selectedCompanyId="";localStorage.removeItem("stok_company_id");select.value="";}
  $("sectors").hidden=!selectedCompanyId; $("users").hidden=!selectedCompanyId;
  if(selectedCompanyId){loadSectors();}else message("Administrador geral: selecione uma empresa para cadastrar setores e usuários.");
 }catch(err){message(err.message,true);}
}
function formatDate(value){if(!value)return "—";const d=new Date(String(value).slice(0,10)+"T00:00:00");return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("pt-BR");}

// Carrega setores oficiais e preenche os campos de seleção da interface.
async function loadSectors(){
 try{
  cachedSectors=await api("/sectors");
  const selects=["productSector","assetSector","deliverySector","userSector"];
  selects.forEach(id=>{
   const el=$(id);if(!el)return;
   const previous=el.value;el.replaceChildren();
   const blank=document.createElement("option");blank.value="";blank.textContent="Selecione o setor";el.appendChild(blank);
   cachedSectors.forEach(s=>{const o=document.createElement("option");o.value=s.name;o.textContent=s.name;el.appendChild(o);});
   if(cachedSectors.some(s=>s.name===previous))el.value=previous;
   else if(currentUser?.role==="operador"&&cachedSectors.some(s=>s.name===currentUser.sector))el.value=currentUser.sector;
   else if(id==="productSector"||id==="assetSector")el.value=cachedSectors.some(s=>s.name==="Estoque")?"Estoque":"";
  });
  const list=$("sectorList");if(list){list.replaceChildren();cachedSectors.forEach(s=>{const p=document.createElement("p");p.textContent=s.name+" — ativo";list.appendChild(p);});}
 }catch(err){message(err.message,true);}
}
$("sectorForm").addEventListener("submit",async e=>{
 e.preventDefault();
 try{await api("/sectors",{method:"POST",body:JSON.stringify({name:$("sectorName").value})});$("sectorName").value="";await loadSectors();message("Setor criado e disponível nos cadastros.");}
 catch(err){message(err.message,true);}
});

function toggleProductFields(){
 const asset=$("productCategory").value==="BEM";
 $("goodsFields").hidden=asset;$("assetFields").hidden=!asset;
 $("productCode").required=!asset;
 $("quantity").required=!asset;
 $("unit").required=!asset;
 $("expiryDate").required=false;
 $("patrimonyCode").required=asset;
 $("assetSector").required=asset;
 $("productSector").required=!asset;
}
$("productCategory").addEventListener("change",toggleProductFields);
toggleProductFields();
$("productForm").addEventListener("submit",async e=>{e.preventDefault();try{
 const asset=$("productCategory").value==="BEM";
 const payload={
  name:$("productName").value.trim(),
  category:asset?"BEM":"MERCADORIA",
  quantity:asset?1:Number($("quantity").value),
  minimum:0,
  unit:asset?"un":$("unit").value,
  entryDate:(asset?$("assetEntryDate").value:$("entryDate").value)||new Date().toISOString().slice(0,10),
  expiryDate:asset?null:($("expiryDate").value||null),
  code:asset?"":$("productCode").value.trim(),
  description:asset?"":$("description").value.trim(),
  patrimonyCode:asset?$("patrimonyCode").value.trim():"",
  condition:asset?$("condition").value.trim():"",
  responsibleSector:asset?$("assetSector").value:$("productSector").value, sector:asset?$("assetSector").value:$("productSector").value
 };
 await api("/products",{method:"POST",body:JSON.stringify(payload)});
 e.target.reset();$("quantity").value=0;$("assetQuantity").value=1;toggleProductFields();await loadProducts();message("Item cadastrado.");
 }catch(err){message(err.message,true);}});
function expiryInfo(date){
 if(!date)return {text:"Não informada",level:"neutral"};
 const today=new Date();today.setHours(0,0,0,0);
 const d=new Date(String(date).slice(0,10)+"T00:00:00");
 const days=Math.ceil((d-today)/86400000);
 if(days<0)return {text:"VENCIDO há "+Math.abs(days)+" dia(s)",level:"expired"};
 if(days===0)return {text:"VENCE HOJE",level:"expired"};
 if(days<=30)return {text:"ATENÇÃO: vence em "+days+" dia(s)",level:"soon"};
 return {text:d.toLocaleDateString("pt-BR"),level:"ok"};
}
async function loadProducts(){try{
 const items=await api("/products");$("goodsBody").replaceChildren();$("assetsBody").replaceChildren();
 items.forEach(p=>{
  const asset=p.category==="BEM",tr=document.createElement("tr");
  const values=asset
   ?[p.name,p.patrimonyCode||"—","1",formatDate(p.entryDate),formatDate(p.lastExitDate),formatDate(p.lastSectorExitDate),p.responsibleSector||"—",p.condition||"—"]
   :[p.name,p.code||"—",p.quantity??0,p.unit||"un",formatDate(p.entryDate)];
  values.forEach(v=>{const td=document.createElement("td");td.textContent=v??"—";tr.appendChild(td);});
  if(!asset){
   const td=document.createElement("td"),info=expiryInfo(p.expiryDate),tag=document.createElement("span");
   tag.className="expiry-alert expiry-"+info.level;tag.textContent=info.text;td.appendChild(tag);tr.appendChild(td);
   const exit=document.createElement("td");exit.textContent=formatDate(p.lastExitDate);tr.appendChild(exit);
   const sectorExit=document.createElement("td");sectorExit.textContent=formatDate(p.lastSectorExitDate);tr.appendChild(sectorExit);
   const sector=document.createElement("td");sector.textContent=p.responsibleSector||"—";tr.appendChild(sector);
   const obs=document.createElement("td");obs.textContent=p.description||"—";tr.appendChild(obs);
  }
  const actions=document.createElement("td");
  if(!asset){["ENTRADA","SAIDA"].forEach(type=>{
   const b=document.createElement("button");b.textContent=type==="ENTRADA"?"Entrada +":"Saída −";b.className=type==="SAIDA"?"secondary":"";b.style.margin="2px";b.addEventListener("click",()=>stockMove(p,type));actions.appendChild(b);
  });}
  if(asset&&currentUser.role==="admin"){
   const transfer=document.createElement("button");transfer.textContent="Transferir setor";transfer.style.margin="2px";
   transfer.addEventListener("click",async()=>{const sector=prompt("Novo setor responsável pelo bem "+p.name+":",p.responsibleSector||"");if(!sector)return;try{const d=await api("/products/"+p._id+"/transfer",{method:"POST",body:JSON.stringify({sector})});message(d.message);loadProducts();}catch(err){message(err.message,true);}});
   actions.appendChild(transfer);
   if(!p.lastExitDate){const exit=document.createElement("button");exit.textContent="Registrar saída";exit.className="secondary";exit.style.margin="2px";exit.addEventListener("click",async()=>{const reason=prompt("Motivo da saída definitiva do bem:");if(reason===null)return;try{const d=await api("/products/"+p._id+"/exit",{method:"POST",body:JSON.stringify({reason})});message(d.message);loadProducts();}catch(err){message(err.message,true);}});actions.appendChild(exit);}
  }
  const del=document.createElement("button");del.textContent="Excluir";del.className="danger";del.style.margin="2px";del.addEventListener("click",async()=>{if(!confirm("Deseja desativar "+p.name+"?"))return;try{await api("/products/"+p._id,{method:"DELETE"});loadProducts();message("Item desativado.");}catch(err){message(err.message,true);}});actions.appendChild(del);tr.appendChild(actions);
  (asset?$("assetsBody"):$("goodsBody")).appendChild(tr);
 });
 }catch(err){message(err.message,true);}}
async function stockMove(p,type){const raw=prompt("Quantidade para "+(type==="ENTRADA"?"entrada":"saída")+" de "+p.name+" ("+(p.unit||"un")+"):");if(raw===null)return;const quantity=Number(raw);if(!Number.isFinite(quantity)||quantity<=0){message("Digite uma quantidade maior que zero.",true);return;}const reasonType=type==="SAIDA"?(prompt("Justificativa: AVARIA, VENDA, CONSUMO, DOACAO ou OUTRO","CONSUMO")||"").toUpperCase():"";const reason=prompt("Descreva a justificativa da movimentação:")||"";if(type==="SAIDA"&&!reason.trim()){message("A justificativa é obrigatória para registrar uma saída.",true);return;}try{await api("/movements/stock",{method:"POST",body:JSON.stringify({productId:p._id,type,quantity,reason,reasonType})});await loadProducts();message("Movimentação registrada.");}catch(err){message(err.message,true);}}
function dateParams(){const p=new URLSearchParams();if($("fromDate").value)p.set("from",$("fromDate").value);if($("toDate").value)p.set("to",$("toDate").value);return p.toString();}
$("filterHistory").addEventListener("click",loadHistory);
$("historySearch").addEventListener("input",renderHistory);
async function loadHistory(){try{cachedMovements=await api("/movements?"+dateParams());renderHistory();}catch(err){message(err.message,true);}}
function renderHistory(){
 const term=($("historySearch").value||"").trim().toLocaleLowerCase("pt-BR");
 const rows=cachedMovements.filter(m=>[m.userName,m.role,m.action,m.productName,m.details,m.sector,m.createdSector,m.sourceSector,m.destinationSector,m.destination].join(" ").toLocaleLowerCase("pt-BR").includes(term));
 $("historyBody").replaceChildren();
 rows.forEach(m=>{const tr=document.createElement("tr");[new Date(m.createdAt).toLocaleString("pt-BR"),m.userName,m.role,m.action,m.productName,(m.quantity??"")+(m.unit?" "+m.unit:""),m.createdSector||"—",m.actionSector||m.sector||"—",m.sourceSector||"—",m.destinationSector||m.destination||"—",m.details].forEach(v=>{const td=document.createElement("td");td.textContent=v??"";tr.appendChild(td);});$("historyBody").appendChild(tr);});
}
$("printHistory").addEventListener("click",()=>window.print());
$("emailForm").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/movements/email-report",{method:"POST",body:JSON.stringify({email:$("reportEmail").value,from:$("fromDate").value,to:$("toDate").value})});message(d.message);}catch(err){message(err.message,true);}});
// Carrega entregas e permite lançar destinos conforme o setor do operador.
async function loadDeliveries(){
 try{
  const [items,products]=await Promise.all([api("/deliveries"),api("/products")]);
  const select=$("deliveryProduct");select.replaceChildren();
  products.filter(p=>p.active!==false).forEach(p=>{const o=document.createElement("option");o.value=p._id;o.textContent=p.category==="BEM"?"[BEM PERMANENTE] "+p.name+" — responsável: "+(p.responsibleSector||"Estoque"):"[MERCADORIA] "+p.name+" — disponível: "+p.quantity+" "+p.unit;select.appendChild(o);});
  const deliveryProduct=$("deliveryProduct"),deliveryQuantity=$("deliveryQuantity");
  function updateDeliveryQuantity(){
   const selected=products.find(p=>p._id===deliveryProduct.value),asset=selected?.category==="BEM";
   deliveryQuantity.max=asset?"1":String(selected?.quantity??"");deliveryQuantity.step=asset?"1":"0.001";deliveryQuantity.min=asset?"1":"0.001";
   deliveryQuantity.value=asset?"1":"";deliveryQuantity.readOnly=asset;
   deliveryQuantity.title=asset?"Bem permanente é controlado individualmente (1 unidade).":"";
  }
  deliveryProduct.onchange=updateDeliveryQuantity;updateDeliveryQuantity();
  $("deliveryForm").hidden=currentUser.role!=="admin";
  $("deliveryList").replaceChildren();
  items.forEach(d=>{
   const card=document.createElement("article");card.className="panel";
   const title=document.createElement("h3");title.textContent=d.productName+" — "+d.sector;card.appendChild(title);
   const latestAssetAction=[...(d.entries||[])].reverse().find(x=>["EXTRAVIO","AVARIA","VENDA","DOACAO"].includes(String(x.destination||"").toUpperCase()));let currentStatus=d.currentSector||"Não informado";if(latestAssetAction){const occurrenceSector=latestAssetAction.actionSector||latestAssetAction.sector||d.sector;const occurrence=String(latestAssetAction.destination||"").toUpperCase();currentStatus=occurrence==="EXTRAVIO"?"NÃO LOCALIZADO — extravio no setor "+occurrenceSector:occurrence==="AVARIA"?"AVARIADO — ocorrência no setor "+occurrenceSector:"SAÍDA DEFINITIVA ("+occurrence+") — setor "+occurrenceSector;}const summary=document.createElement("p");summary.textContent="Cadastrado originalmente em: "+(d.productCreatedSector||d.createdSector||"não informado")+" | Setor de origem: "+(d.sourceSector||"Estoque")+" | Setor para onde foi enviado: "+(d.destinationSector||d.sector)+" | Situação/localização atual: "+currentStatus+" | Entregue: "+d.quantity+" "+d.unit+" | Prestado: "+d.accounted+" | Falta: "+(d.quantity-d.accounted)+" | "+(d.closed?"CONCLUÍDA":"EM ABERTO");card.appendChild(summary);
   (d.entries||[]).forEach(e=>{const p=document.createElement("p");p.textContent=(e.destination||"DESTINO")+" | Ação realizada no setor: "+(e.actionSector||e.sector||d.sector)+" | Origem: "+(e.sourceSector||d.sector)+" | Setor de destino/ocorrência: "+(e.destinationSector||d.sector)+" | "+e.quantity+" "+e.unit+" | "+(e.details||"");card.appendChild(p);});
   if(!d.closed){
    const form=document.createElement("form");form.className="form-grid";
    const isAsset=d.category==="BEM";
    const type=document.createElement("select");(isAsset?["DEVOLUCAO","TRANSFERENCIA","AVARIA","EXTRAVIO","DOACAO","VENDA","OUTRO"]:["DEVOLUCAO","CONSUMO","AVARIA","EXTRAVIO","DOACAO","VENDA","TRANSFERENCIA","OUTRO"]).forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v==="AVARIA"?"AVARIA (DANO)":v;type.appendChild(o);});
    const qty=document.createElement("input");qty.type="number";qty.min=isAsset?"1":"0.001";qty.max=String(Number(d.quantity)-Number(d.accounted||0));qty.step=isAsset?"1":"0.001";qty.value=isAsset?"1":"";qty.placeholder="Quantidade";qty.required=true;qty.readOnly=isAsset;
    const note=document.createElement("input");note.placeholder="Justificativa / observação (obrigatória para avaria, venda, extravio etc.)";note.required=["AVARIA","EXTRAVIO","DOACAO","VENDA","OUTRO"].includes(type.value);
    const target=document.createElement("select");const targetBlank=document.createElement("option");targetBlank.value="";targetBlank.textContent="Setor de destino (transferência)";target.appendChild(targetBlank);cachedSectors.forEach(s=>{const o=document.createElement("option");o.value=s.name;o.textContent=s.name;target.appendChild(o);});
    const updateDestinationFields=()=>{target.hidden=type.value!=="TRANSFERENCIA";target.required=type.value==="TRANSFERENCIA";};
    type.addEventListener("change",()=>{updateDestinationFields();note.required=["AVARIA","EXTRAVIO","DOACAO","VENDA","OUTRO"].includes(type.value);});updateDestinationFields();
    const add=document.createElement("button");add.textContent="Registrar destino";
    const actionInfo=document.createElement("small");actionInfo.textContent="Ação será registrada em nome de "+currentUser.name+" no setor "+(currentUser.sector||d.sector)+". O setor de origem e o setor de destino/ocorrência também ficarão no histórico.";const currentInfo=document.createElement("small");currentInfo.textContent=isAsset?"Setor responsável atualmente registrado: "+(d.currentSector||"Não informado")+". Em caso de extravio, será mostrado como não localizado, mantendo o setor da ocorrência no histórico.":"Setor de destino da entrega: "+(d.destinationSector||d.sector)+". O setor atual do item também fica no cadastro.";form.append(type,qty,note,target,actionInfo,currentInfo,add);
    form.addEventListener("submit",async ev=>{ev.preventDefault();try{await api("/deliveries/"+d._id+"/account",{method:"POST",body:JSON.stringify({type:type.value,quantity:Number(qty.value),note:note.value,targetSector:target.value})});message("Destino registrado no histórico.");loadDeliveries();}catch(err){message(err.message,true);}});
    card.appendChild(form);
    const close=document.createElement("button");close.textContent="Concluir prestação de contas";close.addEventListener("click",async()=>{try{await api("/deliveries/"+d._id+"/close",{method:"POST"});message("Prestação concluída.");loadDeliveries();}catch(err){message(err.message,true);}});card.appendChild(close);
   }
   $("deliveryList").appendChild(card);
  });
 }catch(err){message(err.message,true);}
}
$("deliveryForm").addEventListener("submit",async e=>{e.preventDefault();try{
 const selectedLabel=$("deliveryProduct").selectedOptions[0]?.textContent||"";
 const isAsset=selectedLabel.startsWith("[BEM PERMANENTE]");
 await api("/deliveries",{method:"POST",body:JSON.stringify({productId:$("deliveryProduct").value,quantity:Number($("deliveryQuantity").value),sector:$("deliverySector").value})});
 e.target.reset();
 message(isAsset?"Bem atribuído ao setor e histórico atualizado.":"Entrega registrada e estoque baixado.");
 loadProducts();loadDeliveries();
}catch(err){message(err.message,true);}});


// Relatório administrativo de cadastros e diagnóstico de duplicidades.
let registryCache=[];
function addCell(row,value){const td=document.createElement("td");td.textContent=value??"";row.appendChild(td);}
async function loadRegistryReport(){
 try{
  const query=currentUser?.role==="superadmin"?"?scope=all":"?scope=company";
  const data=await api("/database/registry"+query);registryCache=[...(data.companies||[]).map(c=>({...c,type:"Empresa",companyName:c.name})),...(data.records||[])];
  renderRegistryReport();$("registrySummary").textContent=registryCache.length+" cadastro(s) encontrado(s).";
 }catch(err){message(err.message,true);}
}

async function registryApi(record,path,options={}){
 const headers={...(options.headers||{})};
 if(record.companyId)headers["X-Company-Id"]=record.companyId;
 return api(path,{...options,headers});
}
async function editRegistryRecord(record){
 try{
  if(record.type==="Empresa"){
   const name=window.prompt("Nome da empresa:",record.name);if(name===null)return;
   const slug=window.prompt("Identificador da empresa:",record.slug||"");if(slug===null)return;
   const d=await api("/companies/"+record._id,{method:"PATCH",body:JSON.stringify({name,slug})});message(d.message);
  }else if(record.type==="Setor"){
   const name=window.prompt("Novo nome do setor:",record.name);if(name===null)return;
   const d=await registryApi(record,"/sectors/"+record._id,{method:"PATCH",body:JSON.stringify({name})});message(d.message);
  }else if(record.type==="Usuário"){
   const name=window.prompt("Nome:",record.name);if(name===null)return;
   const email=window.prompt("E-mail:",record.email);if(email===null)return;
   const sector=record.role==="operador"?window.prompt("Setor:",record.sector||""):(record.sector||"");
   if(sector===null)return;
   const d=await registryApi(record,"/users/"+record._id,{method:"PATCH",body:JSON.stringify({name,email,sector})});message(d.message);
  }else if(record.type==="Produto / bem"){
   const name=window.prompt("Nome do item:",record.name);if(name===null)return;
   const payload={name};
   const code=window.prompt("Código:",record.code||"");if(code===null)return;payload.code=code;
   if(record.category==="BEM"){const patrimonyCode=window.prompt("Número de patrimônio:",record.patrimonyCode||"");if(patrimonyCode===null)return;payload.patrimonyCode=patrimonyCode;}
   const d=await registryApi(record,"/products/"+record._id,{method:"PUT",body:JSON.stringify(payload)});message("Cadastro atualizado.");
  }
  await loadRegistryReport();
 }catch(err){message(err.message,true);}
}
async function deactivateRegistryRecord(record){
 const label=record.name||record.email||"este cadastro";
 if(!window.confirm("Deseja desativar "+label+"? O histórico será preservado."))return;
 try{
  let d;
  if(record.type==="Empresa")d=await api("/companies/"+record._id+"/deactivate",{method:"PATCH"});
  else if(record.type==="Setor")d=await registryApi(record,"/sectors/"+record._id+"/deactivate",{method:"PATCH"});
  else if(record.type==="Usuário")d=await api("/users/"+record._id+"/deactivate",{method:"PATCH"});
  else if(record.type==="Produto / bem")d=await registryApi(record,"/products/"+record._id,{method:"DELETE"});
  message(d?.message||"Cadastro desativado. Histórico preservado.");
  await loadRegistryReport();await loadDiagnostics();
 }catch(err){message(err.message,true);}
}

function renderRegistryReport(){
 const term=($("registrySearch").value||"").toLocaleLowerCase("pt-BR"),type=$("registryType").value;
 const items=registryCache.filter(x=>(!type||x.type===type)&&[x.name,x.email,x.patrimonyCode,x.code,x.companyName,x.role,x.sector].some(v=>String(v||"").toLocaleLowerCase("pt-BR").includes(term)));
 const box=$("registryRecords");box.replaceChildren();
 const table=document.createElement("table"),head=document.createElement("thead"),hr=document.createElement("tr");
 ["Tipo","Cadastro","Empresa","Detalhes","Situação","Criado em","Ações"].forEach(v=>{const th=document.createElement("th");th.textContent=v;hr.appendChild(th);});head.appendChild(hr);table.appendChild(head);
 const body=document.createElement("tbody");
 items.forEach(x=>{
  const tr=document.createElement("tr");
  addCell(tr,x.type);addCell(tr,x.name||x.email||"—");addCell(tr,x.type==="Empresa"?(x.name||"—"):(x.companyName||"—"));
  addCell(tr,x.type==="Usuário"?[x.email,x.role,x.sector].filter(Boolean).join(" • "):x.type==="Produto / bem"?[x.category,x.patrimonyCode?"Patrimônio: "+x.patrimonyCode:"",x.quantity!==undefined?"Qtd.: "+x.quantity+" "+(x.unit||""):"",x.responsibleSector].filter(Boolean).join(" • "):x.type==="Setor"?"Setor operacional":"Identificador: "+(x.slug||"—"));
  addCell(tr,x.active===false?"Inativo":(x.approvalStatus==="pending"?"Aguardando aprovação":"Ativo"));
  addCell(tr,x.createdAt?new Date(x.createdAt).toLocaleString("pt-BR"):"—");
  const actions=document.createElement("td");
  if(x.active!==false){
   const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";edit.className="secondary";edit.addEventListener("click",()=>editRegistryRecord(x));actions.appendChild(edit);
   const deactivate=document.createElement("button");deactivate.type="button";deactivate.textContent="Desativar";deactivate.className="danger";deactivate.addEventListener("click",()=>deactivateRegistryRecord(x));actions.appendChild(deactivate);
  }else actions.textContent="Sem ações";
  tr.appendChild(actions);body.appendChild(tr);
 });
 table.appendChild(body);box.appendChild(table);
 $("registrySummary").textContent=items.length+" de "+registryCache.length+" cadastro(s) exibido(s).";
}
async function loadDiagnostics(){
 try{
  const data=await api("/database/diagnostics"),box=$("diagnosticsList");box.replaceChildren();
  const issues=[];
  (data.duplicateIndexes||[]).forEach(x=>issues.push("Índice possivelmente global: "+x.name+" ("+JSON.stringify(x.key)+")."));
  (data.duplicateSectors||[]).forEach(x=>issues.push("Setor duplicado na mesma empresa: "+x.name+" — "+x.count+" registros."));
  (data.duplicatePatrimony||[]).forEach(x=>issues.push("Patrimônio duplicado: "+x.patrimonyCode+" — "+x.count+" registros."));
  const summary=document.createElement("p");summary.textContent=issues.length+" possível(is) problema(s) estrutural(is); "+(data.errors||[]).length+" erro(s) E11000 registrado(s).";$("diagnosticsSummary").replaceChildren(summary);
  issues.forEach(v=>{const p=document.createElement("p");p.className="diagnostic-warning";p.textContent=v;box.appendChild(p);});
  (data.duplicateIndexes||[]).forEach(x=>{
   if(x.name!=="name_1"||currentUser?.role!=="superadmin")return;
   const card=document.createElement("article");card.className="diagnostic-warning";
   const info=document.createElement("p");info.textContent="Sugestão: substituir o índice global name_1 por um índice único composto por empresa + nome do setor. Cadastros não serão apagados.";
   const btn=document.createElement("button");btn.type="button";btn.textContent="Corrigir índice name_1";
   btn.addEventListener("click",async()=>{if(!confirm("Verificar duplicidades, criar o índice companyId + name e remover somente name_1? Nenhum cadastro será apagado."))return;try{const r=await api("/database/diagnostics/fix-sector-index",{method:"POST"});message(r.message);await loadDiagnostics();}catch(err){message(err.message,true);}});
   card.append(info,btn);box.appendChild(card);
  });
  (data.errors||[]).forEach(x=>{
   const article=document.createElement("article");article.className="diagnostic-error";
   const title=document.createElement("strong");title.textContent="Erro MongoDB E"+x.code+" — "+(x.collection||"coleção não identificada");
   const detail=document.createElement("p");detail.textContent=x.message||"Cadastro duplicado";
   const pairs=x.keyValue&&typeof x.keyValue==="object"?Object.entries(x.keyValue).map(([k,v])=>k+" = "+String(v)).join(", "):"não informado";
   const variable=document.createElement("p");variable.textContent="Variável/valor: "+pairs+" | Índice: "+(x.index||"não identificado");
   const meta=document.createElement("small");meta.textContent=[x.route?"Rota: "+x.route:"",x.createdAt?new Date(x.createdAt).toLocaleString("pt-BR"):""].filter(Boolean).join(" • ");
   article.append(title,detail,variable,meta);
   if(x.collection==="sectors"&&x.keyValue?.name){
    const edit=document.createElement("button");edit.type="button";edit.textContent="Editar valor da variável name";edit.className="secondary";
    edit.addEventListener("click",async()=>{
     try{
      if(!registryCache.length)await loadRegistryReport();
      const matches=registryCache.filter(r=>r.type==="Setor"&&r.name===String(x.keyValue.name)&&(!x.companyId||r.companyId===x.companyId));
      if(matches.length!==1){message(matches.length?"Mais de um setor encontrado. Use Consulta de cadastros para escolher o correto.":"Não foi possível identificar um único setor. Use Consulta de cadastros para localizar e editar o registro.",true);return;}
      await editRegistryRecord(matches[0]);await loadDiagnostics();
     }catch(err){message(err.message,true);}
    });article.appendChild(edit);
   }
   const remove=document.createElement("button");remove.type="button";remove.textContent="Excluir registro deste erro";remove.className="danger";
   remove.addEventListener("click",async()=>{if(!confirm("Excluir somente este registro do relatório? O cadastro original será preservado."))return;try{const r=await api("/database/diagnostics/errors/"+encodeURIComponent(x._id),{method:"DELETE"});message(r.message);await loadDiagnostics();}catch(err){message(err.message,true);}});
   article.appendChild(remove);box.appendChild(article);
  });
  if(!issues.length&&!(data.errors||[]).length){const p=document.createElement("p");p.textContent="Nenhuma duplicidade detectada ou erro E11000 registrado no escopo consultado.";box.appendChild(p);}
 }catch(err){message(err.message,true);}
}
$("registryRefresh").addEventListener("click",loadRegistryReport);
$("registrySearch").addEventListener("input",renderRegistryReport);
$("registryType").addEventListener("change",renderRegistryReport);
$("diagnosticsRefresh").addEventListener("click",loadDiagnostics);

/* Backup e restauração: a API confere novamente o perfil de administrador. */
$("backupButton").addEventListener("click",async()=>{
 try{
  const backupQuery=currentUser?.role==="superadmin"?"?companyId="+encodeURIComponent(selectedCompanyId):"";
  if(currentUser?.role==="superadmin"&&!selectedCompanyId)throw new Error("Selecione uma empresa antes de gerar o backup.");
  const response=await fetch(API+"/database/backup"+backupQuery,{headers:{Authorization:"Bearer "+token,...(selectedCompanyId?{"X-Company-Id":selectedCompanyId}:{})}});
  if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d.message||"Não foi possível gerar o backup.");}
  const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="stok-backup-"+new Date().toISOString().slice(0,10)+".json";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  message("Backup baixado. Guarde o arquivo em local seguro.");
 }catch(err){message(err.message,true);}
});
$("restoreButton").addEventListener("click",async()=>{
 const file=$("restoreFile").files[0];
 if(!file){message("Selecione primeiro um arquivo de backup JSON.",true);return;}
 if(!window.confirm("ATENÇÃO: a restauração substituirá os dados atuais do banco. Faça um backup antes. Deseja continuar?"))return;
 const typed=window.prompt("Digite exatamente RESTAURAR STOK para confirmar:");
 if(typed!=="RESTAURAR STOK"){message("Restauração cancelada.");return;}
 try{
  const backup=JSON.parse(await file.text());
  const d=await api("/database/restore",{method:"POST",body:JSON.stringify({backup:backup,confirmation:typed})});
  message(d.message);window.setTimeout(()=>window.location.reload(),1200);
 }catch(err){message(err.message||"Arquivo inválido ou falha na restauração.",true);}
});

$("userForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/users",{method:"POST",body:JSON.stringify({name:$("userName").value,email:$("userEmail").value,password:$("userPassword").value,role:$("userRole").value,sector:$("userSector").value,...(currentUser.role==="superadmin"?{companyId:selectedCompanyId}:{})})});e.target.reset();message("Usuário criado.");}catch(err){message(err.message,true);}});

// Carrega empresas ativas para o cadastro.
async function loadPublicCompanies(){
 try{
  const companies=await api("/auth/companies"),select=$("registerCompany");select.replaceChildren();
  const blank=document.createElement("option");blank.value="";blank.textContent="Selecione a empresa";select.appendChild(blank);
  companies.forEach(company=>{const o=document.createElement("option");o.value=company._id;o.textContent=company.name;select.appendChild(o);});
 }catch(err){message(err.message,true);}
}
async function loadChatCompanies(){
 try{
  const companies=await api("/chat/companies"),select=$("chatCompany"),previous=select.value;select.replaceChildren();
  companies.forEach(company=>{const o=document.createElement("option");o.value=company._id;o.textContent=company.name;select.appendChild(o);});
  $("chatCompanyLabel").hidden=currentUser.role!=="superadmin";
  if(companies.some(x=>x._id===previous))select.value=previous;
  await loadChatMessages();
 }catch(err){message(err.message,true);}
}
async function loadChatMessages(){
 try{
  if(!$("chatCompany").value)return;
  const qs=currentUser.role==="superadmin"?"?companyId="+encodeURIComponent($("chatCompany").value):"";
  const messages=await api("/chat/messages"+qs),box=$("chatMessages");box.replaceChildren();
  messages.forEach(item=>{
   const article=document.createElement("article");article.className="chat-message";
   const heading=document.createElement("strong");heading.textContent=item.senderName+" — "+(item.senderRole==="superadmin"?"Administrador geral STOK":"Administrador da empresa");
   const body=document.createElement("p");body.textContent=item.message;
   const date=document.createElement("small");date.textContent=new Date(item.createdAt).toLocaleString("pt-BR");
   article.append(heading,body,date);box.appendChild(article);
  });
  box.scrollTop=box.scrollHeight;
 }catch(err){message(err.message,true);}
}
$("chatCompany").addEventListener("change",loadChatMessages);
$("refreshChat").addEventListener("click",loadChatMessages);
$("chatForm").addEventListener("submit",async e=>{
 e.preventDefault();try{
  const payload={message:$("chatText").value};
  if(currentUser.role==="superadmin")payload.companyId=$("chatCompany").value;
  await api("/chat/messages",{method:"POST",body:JSON.stringify(payload)});
  $("chatText").value="";await loadChatMessages();message("Mensagem enviada.");
 }catch(err){message(err.message,true);}
});
async function loadPendingUsers(){
 try{
  const users=await api("/users/pending"),box=$("pendingUsers");box.replaceChildren();
  if(!users.length){box.textContent="Não há solicitações aguardando aprovação.";return;}
  users.forEach(user=>{
   const card=document.createElement("article");card.className="panel";
   const info=document.createElement("p");info.textContent=user.name+" — "+user.email+" — setor: "+(user.sector||"não informado")+(user.companyId?.name?" — empresa: "+user.companyId.name:"");
   const approve=document.createElement("button");approve.textContent="Aprovar";approve.addEventListener("click",()=>decideUser(user._id,"approved"));
   const reject=document.createElement("button");reject.textContent="Recusar";reject.className="danger";reject.addEventListener("click",()=>decideUser(user._id,"rejected"));
   card.append(info,approve,reject);box.appendChild(card);
  });
 }catch(err){message(err.message,true);}
}
async function decideUser(id,status){
 try{const d=await api("/users/"+id+"/approval",{method:"PATCH",body:JSON.stringify({status})});message(d.message);loadPendingUsers();}
 catch(err){message(err.message,true);}
}
$("pendingRefresh").addEventListener("click",refreshPendingStatus);
$("pendingLogout").addEventListener("click",()=>$("logout").click());
loadPublicCompanies();

(async()=>{
  try {
    const response = await fetch(API + "/auth/setup-status");
    const status = await response.json();
    if (response.ok && status.needsSetup) {
      token = null;
      localStorage.removeItem("stok_token");
      $("login").hidden = true;
      $("registerScreen").hidden = true;
      $("forgotScreen").hidden = true;
      $("resetScreen").hidden = true;
      $("app").hidden = true;
      $("pendingScreen").hidden = true;
      $("firstSetupScreen").hidden = false;
      return;
    }
  } catch (err) {
    message("Não foi possível verificar a configuração inicial. Confira a conexão com a API.", true);
    return;
  }
  $("firstSetupScreen").hidden = true;
  if (!token) return;
  try {
    const user = await api("/auth/me");
    if (user.approvalStatus === "pending") showPending(user);
    else showLoggedIn(user);
  } catch (_) {
    localStorage.removeItem("stok_token");
    token = null;
  }
})();