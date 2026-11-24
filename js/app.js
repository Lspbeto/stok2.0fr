// Interface do STOK: estoque, entregas, usuários, histórico e relatórios.
const API = window.STOK_CONFIG.API_URL.replace(/\/$/, "");
let token = localStorage.getItem("stok_token"), currentUser = null, cachedMovements = [], cachedUsersReport = [], cachedSectors = [], selectedCompanyId = localStorage.getItem("stok_company_id") || "";
const $ = id => document.getElementById(id);
function message(text, error=false) { $("message").textContent=text; $("message").style.color=error?"#b42318":"#167044"; }
async function api(path, options={}) {
  const response=await fetch(API+path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),...(currentUser?.role==="superadmin"&&selectedCompanyId?{"X-Company-Id":selectedCompanyId}:{}),...(options.headers||{})}});
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
  const roleLabel=isSuperAdmin?"Administrador geral STOK":user.role==="admin"?"Administrador da empresa":user.role==="admin_setor"?"Administrador do setor":"Operador";
  $("welcome").textContent="Olá, "+user.name+" ("+roleLabel+")";
  $("createTab").hidden=!isAdmin; $("globalReportTab").hidden=!isSuperAdmin; $("companies").hidden=!isSuperAdmin; $("sectors").hidden=!isAdmin||(isSuperAdmin&&!selectedCompanyId); $("users").hidden=!isAdmin||(isSuperAdmin&&!selectedCompanyId); $("databaseTab").hidden=!isAdmin; $("chatTab").hidden=false; $("approvalsTab").hidden=!isAdmin; $("authorizationsTab").hidden=false; $("databaseTools").hidden=true;
  const adminRoleOption=$("userRole").querySelector('option[value="admin"]'); if(adminRoleOption)adminRoleOption.hidden=!isSuperAdmin; const sectorAdminOption=$("userRole").querySelector('option[value="admin_setor"]'); if(sectorAdminOption)sectorAdminOption.hidden=!isAdmin; if(!isSuperAdmin&&$("userRole").value==="admin")$("userRole").value="operador";
  $("deliveryForm").hidden=user.role!=="admin";
  loadChatCompanies();
  if(isAdmin){loadPendingUsers();}
  if(isSuperAdmin){
    loadCompaniesList();
    // O administrador geral precisa escolher a empresa antes de consultar dados.
    $("globalCompanySelect")?.closest("label")?.remove();
    loadGlobalCompanySelector();
  }else{
    // Administrador da empresa, administrador do setor e operador nunca escolhem empresa.
    selectedCompanyId="";
    localStorage.removeItem("stok_company_id");
    const companySelector=$("globalCompanyLabel");if(companySelector)companySelector.remove();
    const chatSelector=$("chatCompany");if(chatSelector){chatSelector.disabled=true;}
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
    button.innerHTML = visible ? "<svg class=\"eye-icon\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8\"/><path d=\"M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1 0 2-.2 2.9-.5\"/></svg>" : "<svg class=\"eye-icon\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg>";
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

let globalReportCache={companies:[],users:[]};
async function loadGlobalCompaniesUsersReport(){
 try{
  if(currentUser?.role!=="superadmin")return;
  globalReportCache=await api("/users/global-report");
  renderGlobalCompaniesUsersReport();
 }catch(err){message(err.message,true);}
}
function renderGlobalCompaniesUsersReport(){
 const data=globalReportCache,query=($("globalReportSearch")?.value||"").trim().toLocaleLowerCase("pt-BR");
 const companyBox=$("globalReportCompanies"),userBox=$("globalReportUsers"),sectorBox=$("globalReportSectors"),deletedCompanyBox=$("globalReportDeletedCompanies"),deletedUserBox=$("globalReportDeletedUsers"),deletedSectorBox=$("globalReportDeletedSectors"),summary=$("globalReportSummary");
 [companyBox,userBox,sectorBox,deletedCompanyBox,deletedUserBox,deletedSectorBox].forEach(box=>box?.replaceChildren());
 const companies=(data.companies||[]).filter(x=>(x.name+" "+x.slug).toLocaleLowerCase("pt-BR").includes(query));
 const users=(data.users||[]).filter(x=>(x.name+" "+x.email+" "+x.role+" "+x.sector+" "+(x.companyId?.name||"")).toLocaleLowerCase("pt-BR").includes(query));
 const sectors=(data.sectors||[]).filter(x=>(x.name+" "+(x.companyId?.name||"")).toLocaleLowerCase("pt-BR").includes(query));
 const deletedSectors=(data.deletedSectors||[]).filter(x=>(x.name+" "+(x.companyId?.name||"")).toLocaleLowerCase("pt-BR").includes(query));
 const deletedCompanies=(data.deletedCompanies||[]).filter(x=>(x.name+" "+x.slug).toLocaleLowerCase("pt-BR").includes(query));
 const deletedUsers=(data.deletedUsers||[]).filter(x=>(x.name+" "+x.email+" "+x.role+" "+x.sector+" "+(x.companyId?.name||"")).toLocaleLowerCase("pt-BR").includes(query));
 summary.textContent="Empresas: "+companies.length+" | Usuários: "+users.length+" | Setores: "+sectors.length+" | Excluídos: "+(deletedCompanies.length+deletedUsers.length+deletedSectors.length);
 const makeRow=(box,parts)=>{const row=document.createElement("div");row.className="management-row";parts.forEach(p=>row.appendChild(p));box.appendChild(row);};
 const makeBtn=(label,cls,fn)=>{const b=document.createElement("button");b.type="button";b.className="management-action "+(cls||"");b.textContent=label;b.addEventListener("click",fn);return b;};
 const stamp=d=>d?new Date(d).toLocaleString("pt-BR"):"Data não registrada";
 companies.forEach(company=>{
  const info=document.createElement("div");info.className="management-info";info.textContent=company.name+" ("+company.slug+")";
  const state=document.createElement("span");state.className="management-status";state.textContent=company.active===false?"Pausada":"Ativa";
  const actions=document.createElement("div");actions.className="management-actions";
  actions.append(makeBtn("Editar","",async()=>{const name=prompt("Nome da empresa:",company.name);if(name===null)return;const slug=prompt("Identificador:",company.slug);if(slug===null)return;try{await api("/companies/"+company._id,{method:"PATCH",body:JSON.stringify({name,slug})});await loadGlobalCompaniesUsersReport();message("Empresa atualizada.");}catch(err){message(err.message,true);}}));
  actions.append(makeBtn(company.active===false?"Retomar":"Pausar",company.active===false?"":"warning",async()=>{if(!confirm((company.active===false?"Retomar":"Pausar")+" a empresa "+company.name+"?"))return;try{await api("/companies/"+company._id+(company.active===false?"/restore":"/deactivate"),{method:"PATCH"});await loadGlobalCompaniesUsersReport();await loadGlobalCompanySelector();message("Situação atualizada.");}catch(err){message(err.message,true);}}));
  actions.append(makeBtn("Excluir","danger",async()=>{if(!confirm("Excluir "+company.name+"? Ela sairá da lista principal e ficará no relatório de excluídos com data e hora."))return;try{await api("/companies/"+company._id,{method:"DELETE"});await loadGlobalCompaniesUsersReport();await loadGlobalCompanySelector();message("Empresa movida para excluídos.");}catch(err){message(err.message,true);}}));
  const meta=document.createElement("small");meta.className="management-meta";meta.textContent="Criada em: "+stamp(company.createdAt);
  makeRow(companyBox,[info,state,actions,meta]);
 });
 users.forEach(user=>{
  const role={admin:"Administrador da empresa",admin_setor:"Administrador do setor",operador:"Operador"}[user.role]||user.role;
  const info=document.createElement("div");info.className="management-info";info.textContent=user.name+" | "+user.email+" | "+role+" | "+(user.sector||"Sem setor")+" | "+(user.companyId?.name||"Empresa não identificada");
  const state=document.createElement("span");state.className="management-status";state.textContent=user.active===false?"Pausado":"Ativo";
  const actions=document.createElement("div");actions.className="management-actions";const headers={"X-Company-Id":user.companyId?._id||user.companyId};
  actions.append(makeBtn("Editar","",async()=>{const name=prompt("Nome:",user.name);if(name===null)return;const email=prompt("E-mail:",user.email);if(email===null)return;const profile=prompt("Perfil: admin, admin_setor ou operador",user.role);if(profile===null)return;const sector=prompt("Setor:",user.sector||"");if(sector===null)return;try{await api("/users/"+user._id,{method:"PATCH",headers,body:JSON.stringify({name,email,role:profile,sector})});await loadGlobalCompaniesUsersReport();message("Usuário atualizado.");}catch(err){message(err.message,true);}}));
  actions.append(makeBtn(user.active===false?"Retomar":"Pausar",user.active===false?"":"warning",async()=>{if(!confirm((user.active===false?"Retomar":"Pausar")+" o acesso de "+user.name+"?"))return;try{await api("/users/"+user._id+(user.active===false?"/restore":"/deactivate"),{method:"PATCH",headers});await loadGlobalCompaniesUsersReport();message("Acesso atualizado.");}catch(err){message(err.message,true);}}));
  actions.append(makeBtn("Excluir","danger",async()=>{if(!confirm("Excluir "+user.name+"? Ele sairá da lista e ficará no relatório de excluídos com data e hora."))return;try{await api("/users/"+user._id,{method:"DELETE",headers});await loadGlobalCompaniesUsersReport();message("Usuário movido para excluídos.");}catch(err){message(err.message,true);}}));
  const meta=document.createElement("small");meta.className="management-meta";meta.textContent="Criado em: "+stamp(user.createdAt);
  makeRow(userBox,[info,state,actions,meta]);
 });
 sectors.forEach(sector=>{
  const info=document.createElement("div");info.className="management-info";info.textContent=sector.name+" | "+(sector.companyId?.name||"Empresa não identificada");
  const state=document.createElement("span");state.className="management-status";state.textContent=sector.active===false?"Pausado":"Ativo";
  const actions=document.createElement("div");actions.className="management-actions";
  const headers={"X-Company-Id":sector.companyId?._id||sector.companyId};
  actions.append(makeBtn("Editar","",async()=>{const name=prompt("Nome do setor:",sector.name);if(name===null)return;try{await api("/sectors/"+sector._id,{method:"PATCH",headers,body:JSON.stringify({name})});await loadGlobalCompaniesUsersReport();message("Setor atualizado.");}catch(err){message(err.message,true);}}));
  actions.append(makeBtn(sector.active===false?"Reativar":"Pausar",sector.active===false?"":"warning",async()=>{if(!confirm((sector.active===false?"Reativar":"Pausar")+" o setor "+sector.name+"?"))return;try{await api("/sectors/"+sector._id+(sector.active===false?"/restore":"/deactivate"),{method:"PATCH",headers});await loadGlobalCompaniesUsersReport();message("Situação do setor atualizada.");}catch(err){message(err.message,true);}}));
  actions.append(makeBtn("Excluir","danger",async()=>{if(!confirm("Excluir "+sector.name+"? O setor sairá desta lista e ficará em Setores excluídos com data e hora."))return;try{await api("/sectors/"+sector._id,{method:"DELETE",headers});await loadGlobalCompaniesUsersReport();message("Setor movido para excluídos.");}catch(err){message(err.message,true);}}));
  const meta=document.createElement("small");meta.className="management-meta";meta.textContent="Empresa: "+(sector.companyId?.name||"—")+" | Criado em: "+stamp(sector.createdAt);
  makeRow(sectorBox,[info,state,actions,meta]);
 });
 deletedCompanies.forEach(company=>{const info=document.createElement("div");info.className="management-info";info.textContent="EMPRESA: "+company.name+" ("+company.slug+")";const meta=document.createElement("small");meta.className="management-meta";meta.textContent="Excluída em: "+stamp(company.deletedAt);makeRow(deletedCompanyBox,[info,meta]);});
 deletedSectors.forEach(sector=>{const info=document.createElement("div");info.className="management-info";info.textContent="SETOR: "+sector.name+" | "+(sector.companyId?.name||"Empresa não identificada");const meta=document.createElement("small");meta.className="management-meta";meta.textContent="Excluído em: "+stamp(sector.deletedAt);makeRow(deletedSectorBox,[info,meta]);});
 deletedUsers.forEach(user=>{const role={admin:"Administrador da empresa",admin_setor:"Administrador do setor",operador:"Operador"}[user.role]||user.role;const info=document.createElement("div");info.className="management-info";info.textContent="USUÁRIO: "+user.name+" | "+user.email+" | "+role+" | "+(user.companyId?.name||"Empresa não identificada");const meta=document.createElement("small");meta.className="management-meta";meta.textContent="Excluído em: "+stamp(user.deletedAt);makeRow(deletedUserBox,[info,meta]);});
}

$("globalReportRefresh")?.addEventListener("click",loadGlobalCompaniesUsersReport);
$("globalReportSearch")?.addEventListener("input",renderGlobalCompaniesUsersReport);
async function loadCompaniesList() {
  try {
    const companies = await api("/companies");
    const box = $("companyList");
    box.replaceChildren();
    if (!companies.length) { box.textContent = "Nenhuma empresa cadastrada."; return; }
    companies.forEach(company => {
      const item=document.createElement("div");item.className="management-row";
      const label=document.createElement("span");label.textContent=company.name+" ("+company.slug+") — "+(company.active===false?"inativa":"ativa");item.appendChild(label);
      const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";edit.addEventListener("click",async()=>{const name=prompt("Nome da empresa:",company.name);if(name===null)return;const slug=prompt("Identificador:",company.slug);if(slug===null)return;try{await api("/companies/"+company._id,{method:"PATCH",body:JSON.stringify({name,slug})});await loadCompaniesList();message("Empresa atualizada.");}catch(err){message(err.message,true);}});item.appendChild(edit);
      const action=document.createElement("button");action.type="button";action.textContent=company.active===false?"Reativar":"Excluir";action.className=company.active===false?"":"danger";action.addEventListener("click",async()=>{if(!confirm((company.active===false?"Reativar":"Desativar")+" a empresa "+company.name+"?"))return;try{await api("/companies/"+company._id+(company.active===false?"/restore":"/deactivate"),{method:"PATCH"});await loadCompaniesList();await loadGlobalCompanySelector();message("Situação da empresa atualizada.");}catch(err){message(err.message,true);}});item.appendChild(action);box.appendChild(item);
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
  const companyRequired=["products","deliveries","history","authorizations"].includes(b.dataset.tab);
  if(currentUser?.role==="superadmin"&&companyRequired&&!selectedCompanyId){
    message("Administrador geral: escolha uma empresa no campo Empresa em administração antes de abrir esta área.",true);
    return;
  }
  document.querySelectorAll(".tab").forEach(x=>x.hidden=x.id!==b.dataset.tab);
  document.querySelectorAll(".tab-button").forEach(x=>x.classList.toggle("active",x===b));
  if(b.dataset.tab==="history")loadHistory();
  if(b.dataset.tab==="globalReport"&&currentUser?.role==="superadmin")loadGlobalCompaniesUsersReport();
  if(b.dataset.tab==="products")loadProducts();
  if(b.dataset.tab==="deliveries")loadDeliveries();
  if(b.dataset.tab==="create"){loadSectors();if(currentUser?.role==="superadmin")loadCompaniesList();}
  if(b.dataset.tab==="databaseTools"){loadRegistryReport();loadDiagnostics();}
  if(b.dataset.tab==="chat")loadChatMessages();
  if(b.dataset.tab==="approvals")loadPendingUsers();
  if(b.dataset.tab==="authorizations")loadAuthorizations();
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
    loadSectors();loadProducts();loadHistory();loadDeliveries();loadAuthorizations();loadUsersList();
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
  cachedSectors=await api("/sectors"+(currentUser?.role==="superadmin"?"?includeInactive=true":""));
  const selects=["productSector","assetSector","deliverySector","userSector","requestAssetSector"];
  selects.forEach(id=>{
   const el=$(id);if(!el)return;
   const previous=el.value;el.replaceChildren();
   const blank=document.createElement("option");blank.value="";blank.textContent="Selecione o setor";el.appendChild(blank);
   cachedSectors.filter(s=>s.active!==false).forEach(s=>{const o=document.createElement("option");o.value=s.name;o.textContent=s.name;el.appendChild(o);});
   if(id==="assetSector")el.value=cachedSectors.some(s=>s.name==="Estoque")?"Estoque":"";
   else if(id==="requestAssetSector")el.value=cachedSectors.some(s=>s.name==="Estoque")?"Estoque":"";
   else if(cachedSectors.some(s=>s.name===previous))el.value=previous;
   else if(["operador","admin_setor"].includes(currentUser?.role)&&cachedSectors.some(s=>s.name===currentUser.sector&&s.active!==false)){el.value=currentUser.sector;el.disabled=true;}
   else if(id==="productSector")el.value=cachedSectors.some(s=>s.name==="Estoque")?"Estoque":"";
  });
  const list=$("sectorList");if(list){list.replaceChildren();cachedSectors.forEach(s=>{const row=document.createElement("div");row.className="management-row";const label=document.createElement("span");label.textContent=s.name+" — "+(s.active===false?"inativo":"ativo");row.appendChild(label);
   if(currentUser?.role==="superadmin"&&s.active!==false){const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";edit.addEventListener("click",async()=>{const name=prompt("Novo nome do setor:",s.name);if(name===null)return;try{await api("/sectors/"+s._id,{method:"PATCH",body:JSON.stringify({name})});await loadSectors();await loadUsersList();message("Setor atualizado.");}catch(err){message(err.message,true);}});row.appendChild(edit);
   const del=document.createElement("button");del.type="button";del.textContent="Excluir";del.className="danger";del.addEventListener("click",async()=>{if(!confirm("Desativar o setor "+s.name+"? Só será possível se não houver usuários ativos vinculados."))return;try{await api("/sectors/"+s._id+"/deactivate",{method:"PATCH"});await loadSectors();message("Setor desativado.");}catch(err){message(err.message,true);}});row.appendChild(del);}
   if(currentUser?.role==="superadmin"&&s.active===false){const restore=document.createElement("button");restore.type="button";restore.textContent="Restaurar";restore.addEventListener("click",async()=>{try{await api("/sectors/"+s._id+"/restore",{method:"PATCH"});await loadSectors();message("Setor restaurado.");}catch(err){message(err.message,true);}});row.appendChild(restore);}
   list.appendChild(row);});}
   if(currentUser?.role==="superadmin")loadUsersList();
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
 const items=await api("/products"+(currentUser?.role==="superadmin"?"?includeInactive=true":""));$("goodsBody").replaceChildren();$("assetsBody").replaceChildren();
 items.forEach(p=>{
  const isInactive=p.active===false;
  const asset=p.category==="BEM",tr=document.createElement("tr");
  const values=asset
   ?[p.name,p.patrimonyCode||"—","1",formatDate(p.entryDate),formatDate(p.lastExitDate),formatDate(p.lastSectorExitDate),p.responsibleSector||"—",p.condition||"—"]
   :[p.name,p.code||"—",p.quantity??0,p.unit||"un",formatDate(p.entryDate)];
  values.forEach(v=>{const td=document.createElement("td");td.textContent=v??"—";tr.appendChild(td);});
  if(asset){const createdBy=document.createElement("td");createdBy.textContent=p.createdByName||"Não informado";tr.appendChild(createdBy);}
  if(!asset){
   const td=document.createElement("td"),info=expiryInfo(p.expiryDate),tag=document.createElement("span");
   tag.className="expiry-alert expiry-"+info.level;tag.textContent=info.text;td.appendChild(tag);tr.appendChild(td);
   const exit=document.createElement("td");exit.textContent=formatDate(p.lastExitDate);tr.appendChild(exit);
   const sectorExit=document.createElement("td");sectorExit.textContent=formatDate(p.lastSectorExitDate);tr.appendChild(sectorExit);
   const sector=document.createElement("td");sector.textContent=p.responsibleSector||"—";tr.appendChild(sector);
   const obs=document.createElement("td");obs.textContent=p.description||"—";tr.appendChild(obs);
  }
  const actions=document.createElement("td");
  if(!isInactive&&!asset){["ENTRADA","SAIDA"].forEach(type=>{
   const b=document.createElement("button");b.textContent=type==="ENTRADA"?"Entrada +":"Saída −";b.className=type==="SAIDA"?"secondary":"";b.style.margin="2px";b.addEventListener("click",()=>stockMove(p,type));actions.appendChild(b);
  });}
  if(!isInactive&&asset){
   const transfer=document.createElement("button");transfer.textContent="Transferir ou devolver";transfer.style.margin="2px";
   transfer.addEventListener("click",async()=>{
    const choices=cachedSectors.map(s=>s.name);
    const suggested=p.responsibleSector==="Estoque"?"":"Estoque";
    const sector=prompt("Informe o setor de destino do patrimônio "+p.patrimonyCode+". Digite Estoque para devolver. Setores: "+choices.join(", "),suggested);
    if(!sector)return;
    try{const d=await api("/products/"+p._id+"/transfer",{method:"POST",body:JSON.stringify({sector:sector.trim()})});message(d.message);await loadProducts();await loadHistory();if(currentUser.role==="operador")await loadAuthorizations();}catch(err){message(err.message,true);}
   });
   if(currentUser.role!=="admin_setor")actions.appendChild(transfer);
   if(["admin","superadmin"].includes(currentUser.role)&&!p.lastExitDate){
    const exit=document.createElement("button");exit.textContent="Registrar saída definitiva";exit.className="secondary";exit.style.margin="2px";
    exit.addEventListener("click",async()=>{const reason=prompt("Motivo da saída definitiva do bem:");if(reason===null)return;try{const d=await api("/products/"+p._id+"/exit",{method:"POST",body:JSON.stringify({reason})});message(d.message);await loadProducts();}catch(err){message(err.message,true);}});actions.appendChild(exit);
   }
  }
  if(currentUser.role==="superadmin"&&!isInactive){const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";edit.style.margin="2px";edit.addEventListener("click",async()=>{
   const name=prompt("Nome do produto/bem:",p.name);if(name===null)return;
   const sector=prompt("Setor responsável:",p.responsibleSector||"");if(sector===null)return;
   const description=prompt("Descrição / observações:",p.description||"");if(description===null)return;
   const payload={name,responsibleSector:sector,sector,description};
   if(!asset){const qty=prompt("Quantidade atual:",String(p.quantity??0));if(qty===null)return;payload.quantity=Number(qty);const unit=prompt("Unidade:",p.unit||"un");if(unit===null)return;payload.unit=unit;const code=prompt("Código:",p.code||"");if(code===null)return;payload.code=code;const expiry=prompt("Validade (AAAA-MM-DD, vazio se não houver):",p.expiryDate?String(p.expiryDate).slice(0,10):"");if(expiry===null)return;payload.expiryDate=expiry||null;}
   else{const condition=prompt("Estado de conservação:",p.condition||"");if(condition===null)return;payload.condition=condition;const code=prompt("Número de patrimônio:",p.patrimonyCode||"");if(code===null)return;payload.patrimonyCode=code;}
   try{await api("/products/"+p._id,{method:"PUT",body:JSON.stringify(payload)});await loadProducts();message("Cadastro atualizado.");}catch(err){message(err.message,true);}
  });actions.appendChild(edit);}
  if(currentUser.role==="superadmin"&&isInactive){const restore=document.createElement("button");restore.type="button";restore.textContent="Restaurar";restore.addEventListener("click",async()=>{if(!confirm("Restaurar "+p.name+"?"))return;try{await api("/products/"+p._id+"/restore",{method:"PATCH"});await loadProducts();message("Produto restaurado.");}catch(err){message(err.message,true);}});actions.appendChild(restore);}
  if(!isInactive&&["admin","superadmin"].includes(currentUser.role)){const del=document.createElement("button");del.textContent="Excluir";del.className="danger";del.style.margin="2px";del.addEventListener("click",async()=>{if(!confirm("Deseja desativar "+p.name+"?"))return;try{await api("/products/"+p._id,{method:"DELETE"});loadProducts();message("Item desativado.");}catch(err){message(err.message,true);}});actions.appendChild(del);}tr.appendChild(actions);
  (asset?$("assetsBody"):$("goodsBody")).appendChild(tr);
 });
 }catch(err){message(err.message,true);}}
async function stockMove(p,type){const raw=prompt("Quantidade para "+(type==="ENTRADA"?"entrada":"saída")+" de "+p.name+" ("+(p.unit||"un")+"):");if(raw===null)return;const quantity=Number(raw);if(!Number.isFinite(quantity)||quantity<=0){message("Digite uma quantidade maior que zero.",true);return;}const reasonType=type==="SAIDA"?(prompt("Justificativa: AVARIA, VENDA, CONSUMO, DOACAO ou OUTRO","CONSUMO")||"").toUpperCase():"";const reason=prompt("Descreva a justificativa da movimentação:")||"";if(type==="SAIDA"&&!reason.trim()){message("A justificativa é obrigatória para registrar uma saída.",true);return;}try{await api("/movements/stock",{method:"POST",body:JSON.stringify({productId:p._id,type,quantity,reason,reasonType})});await loadProducts();message("Movimentação registrada.");}catch(err){message(err.message,true);}}
function dateParams(){const p=new URLSearchParams();if($("fromDate").value)p.set("from",$("fromDate").value);if($("toDate").value)p.set("to",$("toDate").value);return p.toString();}
$("filterHistory").addEventListener("click",loadHistory);
$("historySearch").addEventListener("input",renderHistory);
$("reportType").addEventListener("change",loadHistory);
async function loadHistory(){try{
 const type=$("reportType")?.value||"both";
 const jobs=[];
 if(type!=="users")jobs.push(api("/movements?"+dateParams()+(currentUser?.role==="superadmin"?"&includeDeleted=true":"")).then(v=>{cachedMovements=v;}));
 else cachedMovements=[];
 if(type!=="movements")jobs.push(api("/users").then(v=>{cachedUsersReport=v;}));
 else cachedUsersReport=[];
 await Promise.all(jobs);renderHistory();
 }catch(err){message(err.message,true);}}
function historyRoleLabel(role){return ({admin:"Administrador da empresa",admin_setor:"Administrador do setor",operador:"Operador",superadmin:"Administrador geral STOK"})[role]||role||"Não informado";}
function renderHistory(){
 const type=$("reportType")?.value||"both";
 $("usersReportSection").hidden=type==="movements";
 $("movementsReportSection").hidden=type==="users";
 $("emailForm").hidden=type==="users";
 const term=($("historySearch").value||"").trim().toLocaleLowerCase("pt-BR");
 const userRows=cachedUsersReport.filter(u=>[u.name,u.email,historyRoleLabel(u.role),u.sector,u.active===false?"inativo":"ativo"].join(" ").toLocaleLowerCase("pt-BR").includes(term));
 $("usersReportBody").replaceChildren();
 userRows.forEach(u=>{const tr=document.createElement("tr");[
  u.name,u.email,historyRoleLabel(u.role),u.sector||"—",
  u.active===false?"Inativo":(u.approvalStatus==="pending"?"Aguardando aprovação":"Ativo"),
  u.createdAt?new Date(u.createdAt).toLocaleString("pt-BR"):"—"
 ].forEach(v=>{const td=document.createElement("td");td.textContent=v??"";tr.appendChild(td);});$("usersReportBody").appendChild(tr);});
 const rows=cachedMovements.filter(m=>[m.userName,historyRoleLabel(m.role),m.action,m.productName,m.details,m.sector,m.createdSector,m.sourceSector,m.destinationSector,m.destination].join(" ").toLocaleLowerCase("pt-BR").includes(term));
 $("historyBody").replaceChildren();
 rows.forEach(m=>{const tr=document.createElement("tr");[new Date(m.createdAt).toLocaleString("pt-BR"),m.userName,historyRoleLabel(m.role),m.action,m.productName,(m.quantity??"")+(m.unit?" "+m.unit:""),m.createdSector||"—",m.actionSector||m.sector||"—",m.sourceSector||"—",m.destinationSector||m.destination||"—",m.details].forEach(v=>{const td=document.createElement("td");td.textContent=v??"";tr.appendChild(td);});
  const actions=document.createElement("td");if(currentUser?.role==="superadmin"){const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";edit.addEventListener("click",async()=>{const details=prompt("Corrigir detalhes do histórico:",m.details||"");if(details===null)return;const action=prompt("Ação:",m.action||"");if(action===null)return;const quantity=prompt("Quantidade:",m.quantity??"");if(quantity===null)return;try{await api("/movements/"+m._id,{method:"PATCH",body:JSON.stringify({details,action,...(quantity.trim()!==""?{quantity:Number(quantity)}:{})})});await loadHistory();message("Histórico corrigido e auditado.");}catch(err){message(err.message,true);}});
   const del=document.createElement("button");del.type="button";del.textContent=m.isDeleted?"Excluído":"Excluir";del.disabled=!!m.isDeleted;del.className="danger";del.addEventListener("click",async()=>{if(!confirm("Ocultar esta movimentação do histórico comum? O registro original será preservado para auditoria."))return;try{await api("/movements/"+m._id,{method:"DELETE"});await loadHistory();message("Movimentação excluída da visualização comum.");}catch(err){message(err.message,true);}});
   actions.append(edit,del);if(m.isDeleted){const restore=document.createElement("button");restore.type="button";restore.textContent="Restaurar";restore.addEventListener("click",async()=>{try{await api("/movements/"+m._id+"/restore",{method:"PATCH"});await loadHistory();message("Movimentação restaurada.");}catch(err){message(err.message,true);}});actions.appendChild(restore);}}
  tr.appendChild(actions);$("historyBody").appendChild(tr);});
}
$("printHistory").addEventListener("click",()=>window.print());
$("emailForm").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/movements/email-report",{method:"POST",body:JSON.stringify({email:$("reportEmail").value,from:$("fromDate").value,to:$("toDate").value})});message(d.message);}catch(err){message(err.message,true);}});
// Carrega entregas e permite lançar destinos conforme o setor do operador.
async function loadDeliveries(){
 try{
  const [items,products]=await Promise.all([api("/deliveries"),api("/products")]);
  const select=$("deliveryProduct");select.replaceChildren();
  products.filter(p=>p.active!==false).forEach(p=>{const o=document.createElement("option");o.value=p._id;o.textContent=p.category==="BEM"?"[BEM PERMANENTE] "+p.name+" — patrimônio: "+(p.patrimonyCode||"não informado")+" — responsável: "+(p.responsibleSector||"Estoque"):"[MERCADORIA] "+p.name+" — disponível: "+p.quantity+" "+p.unit;select.appendChild(o);});
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
   const latestAssetAction=[...(d.entries||[])].reverse().find(x=>["EXTRAVIO","AVARIA","VENDA","DOACAO"].includes(String(x.destination||"").toUpperCase()));let currentStatus=d.currentSector||"Não informado";if(latestAssetAction){const occurrenceSector=latestAssetAction.actionSector||latestAssetAction.sector||d.sector;const occurrence=String(latestAssetAction.destination||"").toUpperCase();currentStatus=occurrence==="EXTRAVIO"?"NÃO LOCALIZADO — extravio no setor "+occurrenceSector:occurrence==="AVARIA"?"AVARIADO — ocorrência no setor "+occurrenceSector:"SAÍDA DEFINITIVA ("+occurrence+") — setor "+occurrenceSector;}const summary=document.createElement("p");summary.textContent=(d.patrimonyCode?"Patrimônio: "+d.patrimonyCode+" | ":"")+"Cadastrado por: "+(d.createdByName||"Não informado")+" | Entregue por: "+(d.userName||"Não informado")+" | Cadastrado originalmente no setor: "+(d.productCreatedSector||d.createdSector||"não informado")+" | Setor de origem: "+(d.sourceSector||"Estoque")+" | Setor que recebeu: "+(d.destinationSector||d.sector)+" | Situação/localização atual: "+currentStatus+" | Entregue: "+d.quantity+" "+d.unit+" | Prestado: "+d.accounted+" | Falta: "+(d.quantity-d.accounted)+" | "+(d.closed?"CONCLUÍDA":"EM ABERTO");card.appendChild(summary);
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
  (data.duplicateIndexes||[]).forEach(x=>issues.push("Índice global antigo detectado: "+x.name+" ("+JSON.stringify(x.key)+")."));
  (data.duplicateSectors||[]).forEach(x=>issues.push("Setor duplicado na mesma empresa: "+x.name+" — "+x.count+" registros."));
  (data.duplicatePatrimony||[]).forEach(x=>issues.push("Patrimônio duplicado: "+x.patrimonyCode+" — "+x.count+" registros."));
  const status=data.sectorIndexStatus||{};
  const statusCard=document.createElement("article");statusCard.className="diagnostic-warning";
  const statusTitle=document.createElement("strong");statusTitle.textContent="Verificação atual dos índices de setores";
  const statusText=document.createElement("p");
  statusText.textContent="Índice global name_1: "+(status.legacyGlobalNameIndexExists?"AINDA EXISTE":"não existe")+
   " | Índice único companyId + name: "+(status.compoundUniqueIndexExists?"confirmado":"NÃO CONFIRMADO");
  statusCard.append(statusTitle,statusText);
  if(Array.isArray(data.sectorIndexes)&&data.sectorIndexes.length){
   const list=document.createElement("small");
   list.textContent="Índices encontrados: "+data.sectorIndexes.map(i=>i.name+" ["+JSON.stringify(i.key)+"]"+(i.unique?" Unique":"")).join(" • ");
   statusCard.appendChild(list);
  }
  box.appendChild(statusCard);
  const summary=document.createElement("p");
  summary.textContent=issues.length+" problema(s) estrutural(is); "+(data.errors||[]).length+" erro(s) ainda exibido(s). Atualização automática a cada 15 segundos.";
  $("diagnosticsSummary").replaceChildren(summary);
  issues.forEach(v=>{const p=document.createElement("p");p.className="diagnostic-warning";p.textContent=v;box.appendChild(p);});
  (data.duplicateIndexes||[]).forEach(x=>{
   if(x.name!=="name_1"||currentUser?.role!=="superadmin")return;
   const card=document.createElement("article");card.className="diagnostic-warning";
   const info=document.createElement("p");info.textContent="Sugestão: substituir o índice global name_1 por um índice único composto por empresa + nome do setor. Cadastros não serão apagados.";
   const btn=document.createElement("button");btn.type="button";btn.textContent="Corrigir índice name_1";
   btn.addEventListener("click",async()=>{if(!confirm("Verificar duplicidades, criar o índice companyId + name e remover somente name_1? Nenhum cadastro será apagado."))return;try{const result=await api("/database/diagnostics/fix-sector-index",{method:"POST"});message(result.message);await loadDiagnostics();}catch(err){message(err.message,true);}});
   card.append(info,btn);box.appendChild(card);
  });
  (data.errors||[]).forEach(x=>{
   const article=document.createElement("article");article.className="diagnostic-error";
   const heading=document.createElement("div");heading.className="diagnostic-error-heading";
   const title=document.createElement("strong");title.textContent="Erro MongoDB E"+x.code+" — "+(x.collection||"coleção não identificada");
   const meta=document.createElement("small");meta.textContent=[x.index?"Índice: "+x.index:"",x.route?"Rota: "+x.route:"",x.createdAt?new Date(x.createdAt).toLocaleString("pt-BR"):""].filter(Boolean).join(" • ");
   const eye=document.createElement("button");eye.type="button";eye.className="secondary diagnostic-eye";eye.textContent="👁";eye.title="Ver detalhes do erro";eye.setAttribute("aria-label","Ver detalhes do erro");eye.setAttribute("aria-expanded","false");
   const details=document.createElement("div");details.hidden=true;details.className="diagnostic-error-details";
   const detail=document.createElement("p");detail.textContent=x.message||"Cadastro duplicado";
   const pairs=x.keyValue&&typeof x.keyValue==="object"?Object.entries(x.keyValue).map(([k,v])=>k+" = "+String(v)).join(", "):"não informado";
   const variable=document.createElement("p");variable.textContent="Variável/valor: "+pairs+" | Índice: "+(x.index||"não identificado");
   details.append(detail,variable);
   if(x.collection==="sectors"&&x.keyValue?.name){
    const edit=document.createElement("button");edit.type="button";edit.textContent="Editar valor da variável name";edit.className="secondary";
    edit.addEventListener("click",async()=>{
     try{
      if(!registryCache.length)await loadRegistryReport();
      const matches=registryCache.filter(r=>r.type==="Setor"&&r.name===String(x.keyValue.name)&&(!x.companyId||r.companyId===x.companyId));
      if(matches.length!==1){message(matches.length?"Mais de um setor encontrado. Use Consulta de cadastros para escolher o correto.":"Não foi possível identificar um único setor. Use Consulta de cadastros para localizar e editar o registro.",true);return;}
      await editRegistryRecord(matches[0]);await loadDiagnostics();
     }catch(err){message(err.message,true);}
    });details.appendChild(edit);
   }
   const remove=document.createElement("button");remove.type="button";remove.textContent="Excluir registro deste erro";remove.className="danger";
   remove.addEventListener("click",async()=>{if(!confirm("Excluir somente este registro do relatório? O cadastro original será preservado."))return;try{const result=await api("/database/diagnostics/errors/"+encodeURIComponent(x._id),{method:"DELETE"});message(result.message);await loadDiagnostics();}catch(err){message(err.message,true);}});
   details.appendChild(remove);
   eye.addEventListener("click",()=>{
    details.hidden=!details.hidden;eye.textContent=details.hidden?"👁":"🙈";
    eye.title=details.hidden?"Ver detalhes do erro":"Ocultar detalhes do erro";
    eye.setAttribute("aria-label",eye.title);eye.setAttribute("aria-expanded",String(!details.hidden));
   });
   heading.append(title,eye);article.append(heading,meta,details);box.appendChild(article);
  });
  if(!issues.length&&!(data.errors||[]).length){const p=document.createElement("p");p.textContent="Nenhuma duplicidade ou erro ativo encontrado neste momento.";box.appendChild(p);}
  // Consulta novamente enquanto a tela de diagnósticos estiver aberta.
  if(!window.stokDiagnosticsTimer)window.stokDiagnosticsTimer=window.setInterval(()=>{
   const tab=$("databaseTools");
   if(tab&&!tab.hidden&&currentUser&&["admin","superadmin"].includes(currentUser.role))loadDiagnostics();
  },15000);
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

async function loadUsersList(){
 try{
  if(currentUser?.role!=="superadmin"||!selectedCompanyId)return;
  const users=await api("/users"),box=$("userList");if(!box)return;box.replaceChildren();
  if(!users.length){box.textContent="Nenhum usuário cadastrado nesta empresa.";return;}
  users.forEach(user=>{
   const row=document.createElement("div");row.className="management-row";
   const role={admin:"Administrador da empresa",admin_setor:"Administrador do setor",operador:"Operador"}[user.role]||user.role;
   const label=document.createElement("span");label.textContent=user.name+" — "+user.email+" — "+role+" — "+(user.sector||"Sem setor")+" — "+(user.active===false?"inativo":"ativo");row.appendChild(label);
   const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";edit.addEventListener("click",async()=>{
    const name=prompt("Nome:",user.name);if(name===null)return;const email=prompt("E-mail:",user.email);if(email===null)return;
    const profile=prompt("Perfil: admin, admin_setor ou operador",user.role);if(profile===null)return;
    const sector=prompt("Setor:",user.sector||"");if(sector===null)return;
    try{await api("/users/"+user._id,{method:"PATCH",body:JSON.stringify({name,email,role:profile,sector})});await loadUsersList();message("Usuário atualizado.");}catch(err){message(err.message,true);}
   });row.appendChild(edit);
   const action=document.createElement("button");action.type="button";action.textContent=user.active===false?"Reativar":"Excluir";action.className=user.active===false?"":"danger";action.addEventListener("click",async()=>{
    if(!confirm((user.active===false?"Reativar":"Desativar")+" o acesso de "+user.name+"?"))return;
    try{await api("/users/"+user._id+(user.active===false?"/restore":"/deactivate"),{method:"PATCH"});await loadUsersList();message("Acesso do usuário atualizado.");}catch(err){message(err.message,true);}
   });row.appendChild(action);box.appendChild(row);
  });
 }catch(err){message(err.message,true);}
}
$("userForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/users",{method:"POST",body:JSON.stringify({name:$("userName").value,email:$("userEmail").value,password:$("userPassword").value,role:$("userRole").value,sector:$("userSector").value,...(currentUser.role==="superadmin"?{companyId:selectedCompanyId}:{})})});e.target.reset();await loadUsersList();message("Usuário criado.");}catch(err){message(err.message,true);}});

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
  $("chatCompany").disabled=currentUser.role!=="superadmin";
  if(companies.some(x=>x._id===previous))select.value=previous;
  await loadChatMessages();
  if(!window.stokChatTimer)window.stokChatTimer=window.setInterval(()=>{
   const chatTab=$("chat");
   if(currentUser&&chatTab&&!chatTab.hidden)loadChatMessages();
  },2000);
 }catch(err){message(err.message,true);}
}
async function loadChatMessages(){
 try{
  if(!$("chatCompany").value)return;
  const qs=currentUser.role==="superadmin"?"?companyId="+encodeURIComponent($("chatCompany").value):"";
  const messages=await api("/chat/messages"+qs),box=$("chatMessages");box.replaceChildren();
  messages.forEach(item=>{
   const article=document.createElement("article");article.className="chat-message";
   const roleLabel=item.senderRole==="superadmin"?"Administrador geral STOK":item.senderRole==="admin"?"Administrador da empresa":item.senderRole==="admin_setor"?"Administrador do setor":"Operador";
   const heading=document.createElement("strong");heading.textContent=item.senderName+" — "+roleLabel+(item.senderSector?" • "+item.senderSector:"");
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

 // Painel central: operadores abrem pedidos; administradores analisam conforme seu alcance.
 async function loadAuthorizations(){
  try{
   const operator=currentUser?.role==="operador";
   $("authorizationForms").hidden=!operator;
   if(operator){
    const products=await api("/products");
    const assets=products.filter(p=>p.category==="BEM"&&p.responsibleSector===currentUser.sector);
    const goods=products.filter(p=>p.category==="MERCADORIA");
    const stock=goods.filter(p=>p.responsibleSector==="Estoque");
    const own=goods.filter(p=>p.responsibleSector===currentUser.sector);
    const fill=(id,items,label)=>{const el=$(id),old=el.value;el.replaceChildren();items.forEach(p=>{const o=document.createElement("option");o.value=p._id;o.textContent=label(p);el.appendChild(o);});if(items.some(p=>p._id===old))el.value=old;};
    fill("requestAsset",assets,p=>p.name+" — patrimônio "+p.patrimonyCode);
    fill("requestProduct",stock,p=>p.name+" — disponível "+p.quantity+" "+p.unit);
    fill("adjustProduct",own,p=>p.name+" — registrado "+p.quantity+" "+p.unit);
    const sector=$("requestAssetSector"),previous=sector.value;sector.replaceChildren();
    cachedSectors.forEach(s=>{const o=document.createElement("option");o.value=s.name;o.textContent=s.name;sector.appendChild(o);});
    if(cachedSectors.some(s=>s.name===previous))sector.value=previous;
    else if(cachedSectors.some(s=>s.name==="Estoque"))sector.value="Estoque";
   }
   if(!window.stokAuthorizationTimer)window.stokAuthorizationTimer=window.setInterval(()=>{const tab=$("authorizations");if(currentUser&&tab&&!tab.hidden)loadAuthorizations();},5000);
  const requests=await api("/authorizations"),box=$("authorizationList");box.replaceChildren();
   if(!requests.length){box.textContent="Nenhuma solicitação encontrada.";return;}
   requests.forEach(item=>{
    const card=document.createElement("article");card.className="panel";
    const type={MOVIMENTACAO_BEM:"Transferência/devolução de bem",SOLICITACAO_PRODUTO:"Solicitação de produto",ACERTO_ESTOQUE:"Acerto de estoque"}[item.type]||item.type;
    const status={PENDENTE:"Aguardando análise",APROVADA:"Aprovada",RECUSADA:"Recusada"}[item.status]||item.status;
    const info=document.createElement("p");info.textContent=type+" — "+status+" | Solicitante: "+item.requesterName+" | Setor: "+item.requesterSector;
    const details=document.createElement("p");details.textContent=[item.productName,item.patrimonyCode?"Patrimônio: "+item.patrimonyCode:"",item.sourceSector?"Origem: "+item.sourceSector:"",item.destinationSector?"Destino: "+item.destinationSector:"",item.quantity!==null&&item.quantity!==undefined?"Quantidade: "+item.quantity+" "+(item.unit||""):"",item.currentQuantity!==null&&item.currentQuantity!==undefined?"Registrado: "+item.currentQuantity:"",item.countedQuantity!==null&&item.countedQuantity!==undefined?"Encontrado: "+item.countedQuantity:"","Justificativa: "+item.reason,item.decisionNote?"Observação: "+item.decisionNote:""].filter(Boolean).join(" • ");
    card.append(info,details);
    if(item.status==="PENDENTE"&&["admin","admin_setor","superadmin"].includes(currentUser.role)){
     const note=document.createElement("input");note.placeholder="Observação da decisão (opcional)";
     const approve=document.createElement("button");approve.textContent="Aprovar";approve.addEventListener("click",()=>decideAuthorization(item._id,"APROVADA",note.value));
     const reject=document.createElement("button");reject.textContent="Recusar";reject.className="danger";reject.addEventListener("click",()=>decideAuthorization(item._id,"RECUSADA",note.value));
     card.append(note,approve,reject);
    }
    box.appendChild(card);
   });
  }catch(err){message(err.message,true);}
 }
 async function decideAuthorization(id,status,note){
  try{const d=await api("/authorizations/"+id+"/decision",{method:"PATCH",body:JSON.stringify({status,note})});message(d.message);await loadAuthorizations();await loadProducts();await loadHistory();}
  catch(err){message(err.message,true);}
 }
 $("assetRequestForm").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/authorizations/asset",{method:"POST",body:JSON.stringify({productId:$("requestAsset").value,destinationSector:$("requestAssetSector").value,reason:$("requestAssetReason").value})});e.target.reset();message(d.message);await loadAuthorizations();}catch(err){message(err.message,true);}});
 $("productRequestForm").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/authorizations/product",{method:"POST",body:JSON.stringify({productId:$("requestProduct").value,quantity:Number($("requestProductQuantity").value),reason:$("requestProductReason").value})});e.target.reset();message(d.message);await loadAuthorizations();}catch(err){message(err.message,true);}});
 $("stockAdjustmentForm").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/authorizations/stock-adjustment",{method:"POST",body:JSON.stringify({productId:$("adjustProduct").value,countedQuantity:Number($("countedQuantity").value),reason:$("adjustReason").value})});e.target.reset();message(d.message);await loadAuthorizations();}catch(err){message(err.message,true);}});

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