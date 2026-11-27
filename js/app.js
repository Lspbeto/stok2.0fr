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
async function readCompanyContract() {
  const file = $("companyContract")?.files?.[0];
  if (!file) return null;
  if (file.type !== "application/pdf" || file.size > 8 * 1024 * 1024) throw new Error("Escolha um PDF válido de até 8 MB.");
  const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("Não foi possível ler o contrato.")); reader.readAsDataURL(file); });
  return { fileName: file.name, mimeType: file.type, data };
}
async function openCompanyContract(companyId) {
  const response = await fetch(API + "/companies/" + companyId + "/contract", { headers: token ? { Authorization: "Bearer " + token } : {} });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "Não foi possível abrir o contrato."); }
  const url = URL.createObjectURL(await response.blob()); const tab = window.open(url, "_blank", "noopener");
  if (!tab) { const link = document.createElement("a"); link.href = url; link.download = "contrato-" + companyId + ".pdf"; link.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function showPending(user) {
  currentUser=user; $("login").hidden=true; $("temporaryScreen").hidden=true; $("registerScreen").hidden=true; $("forgotScreen").hidden=true; $("resetScreen").hidden=true; $("app").hidden=true; $("pendingScreen").hidden=false;
  $("pendingMessage").textContent="Olá, "+user.name+". Sua solicitação para a empresa selecionada está aguardando aprovação. Você não pode acessar o estoque, entregas ou relatórios enquanto não for aprovado.";
}
async function refreshPendingStatus(){
 try{const user=await api("/auth/me");if(user.approvalStatus==="approved"){ $("pendingScreen").hidden=true; showLoggedIn(user); message("Acesso aprovado. Bem-vindo ao STOK.");}else if(user.approvalStatus==="rejected"){$("pendingMessage").textContent="Sua solicitação foi recusada. Entre em contato com o administrador da empresa."; }else{$("pendingMessage").textContent="Sua solicitação continua aguardando aprovação do administrador.";}}
 catch(err){$("pendingMessage").textContent=err.message;}
}
function renderProfile(user){
 const roleLabels={superadmin:"Administrador geral",admin:"Administrador da empresa",admin_setor:"Administrador do setor",operador:"Operador"};
 const company=user.companyName||user.companyId?.name||(user.companyId?String(user.companyId):"Não vinculada");
 const fields=[["Nome completo",user.name],["E-mail",user.email],["Log",user.log||"Ainda não cadastrado"],["Perfil de acesso",roleLabels[user.role]||user.role||"Não informado"],["Empresa",user.role==="superadmin"?"Todas as empresas (acesso geral)":company],["Setor",user.sector||"Não definido"],["Situação",user.active===false?"Inativo":user.approvalStatus==="pending"?"Aguardando aprovação":"Ativo"]];
 const box=$("profileDetails");box.replaceChildren();
  if($("profileLog"))$("profileLog").value=user.log||"";
 fields.forEach(([label,value])=>{const item=document.createElement("article");item.className="profile-detail";const title=document.createElement("span");title.textContent=label;const detail=document.createElement("strong");detail.textContent=value??"Não informado";item.append(title,detail);box.appendChild(item);});
 $("profileRolePreview").hidden=user.role!=="superadmin";
}
$("profileLogForm").addEventListener("submit",async e=>{e.preventDefault();try{const result=await api("/auth/profile",{method:"PATCH",body:JSON.stringify({log:$("profileLog").value})});currentUser={...currentUser,...result.user};renderProfile(currentUser);message(result.message||"Log atualizado.");}catch(err){message(err.message,true);}});
function showLoggedIn(user) {
  currentUser=user; $("changePasswordPanel").hidden=true; $("pendingScreen").hidden=true; $("login").hidden=true; $("temporaryScreen").hidden=true; $("registerScreen").hidden=true; $("forgotScreen").hidden=true; $("resetScreen").hidden=true; $("app").hidden=false;
  const isSuperAdmin=user.role==="superadmin";
  const isAdmin=["admin","superadmin"].includes(user.role);
  const roleLabel=isSuperAdmin?"Administrador geral STOK":user.role==="admin"?"Administrador da empresa":user.role==="admin_setor"?"Administrador do setor":"Operador";
  $("welcome").textContent="Olá, "+user.name+" ("+roleLabel+")";
  renderProfile(user);
   $("managementTab").hidden=false; if($("createTab"))$("createTab").hidden=!isAdmin; if($("dashboardTab"))$("dashboardTab").hidden=!["admin","admin_setor","superadmin"].includes(currentUser.role); if($("reportsTab"))$("reportsTab").hidden=!["admin","admin_setor","superadmin"].includes(currentUser.role); $("reportAllCompaniesWrap").hidden=!isSuperAdmin; if($("globalReportTab"))$("globalReportTab").hidden=!isSuperAdmin; $("companies").hidden=!isSuperAdmin; $("companyData").hidden=user.role!=="admin"; $("sectors").hidden=!isAdmin||(isSuperAdmin&&!selectedCompanyId); $("users").hidden=!isAdmin||(isSuperAdmin&&!selectedCompanyId); if($("databaseTab"))$("databaseTab").hidden=!isAdmin; $("chatTab").hidden=false; $("approvalsTab").hidden=!isAdmin; $("authorizationsTab").hidden=true; $("databaseTools").hidden=true;
   const adminMain=["admin","superadmin"].includes(user.role);
   // O administrador geral tem somente três áreas principais.
   if(isSuperAdmin){
     $("profileTab").hidden=false;
     $("managementTab").hidden=false;
     $("chatTab").hidden=false;
     ["productsTab","deliveriesTab","createTab","dashboardTab","globalReportTab","databaseTab","activitiesTab","approvalsTab","reportsTab","authorizationsTab"].forEach(id=>{if($(id))$(id).hidden=true;});
     $("profileRolePreview").hidden=true;
     $("managementReportFilter").hidden=false;
     $("managementAuthorizations").hidden=false;
     $("managementProducts").hidden=false; $("managementDeliveries").hidden=false; $("managementActivities").hidden=false;
     if($("managementHistory"))$("managementHistory").hidden=false; $("managementCreate").hidden=false;
     $("managementGlobalReport").hidden=false; $("managementDatabase").hidden=false;
     $("managementDashboard").hidden=false; if($("managementReports"))$("managementReports").hidden=false;
   }else if(user.role==="admin"){
     $("profileTab").hidden=false; $("managementTab").hidden=false; $("chatTab").hidden=false;
     ["productsTab","deliveriesTab","createTab","dashboardTab","globalReportTab","databaseTab","activitiesTab","approvalsTab","reportsTab","authorizationsTab"].forEach(id=>{if($(id))$(id).hidden=true;});
     $("profileRolePreview").hidden=true;
     $("managementReportFilter").hidden=true;
     $("managementCreate").hidden=false;
     $("managementAuthorizations").hidden=false;
     $("managementProducts").hidden=false; $("managementDeliveries").hidden=false; $("managementActivities").hidden=false;
     if($("managementHistory"))$("managementHistory").hidden=false; $("managementCreate").hidden=true;
     $("managementGlobalReport").hidden=true; $("managementDatabase").hidden=true;
     $("managementDashboard").hidden=false; if($("managementReports"))$("managementReports").hidden=false;
   }else{
     // Todos os perfis acessam as operações permitidas a partir de Gerenciamento.
     $("profileTab").hidden=false;
     $("managementTab").hidden=false; $("chatTab").hidden=false;
     ["productsTab","deliveriesTab","activitiesTab"].forEach(id=>{if($(id))$(id).hidden=true;});
     $("managementProducts").hidden=false; $("managementDeliveries").hidden=false; $("managementActivities").hidden=false;
     ["managementAuthorizations","managementDashboard","managementReports","managementHistory","managementCreate","managementGlobalReport","managementDatabase","managementReportFilter"].forEach(id=>{if($(id))$(id).hidden=true;});
     $("authorizationsTab").hidden=true; $("approvalsTab").hidden=true;
   }
   // Trava visual definitiva: qualquer perfil administrativo vê somente
   // Meu perfil, Gerenciamento e Chat na navegação principal.
   // Menu principal padronizado: operações ficam dentro de Gerenciamento para todos.
   const allowedMainTabs=new Set(["profile","management","chat"]);
   document.querySelectorAll(".main-nav .tab-button").forEach(button=>{
     const visible=allowedMainTabs.has(button.dataset.tab);
     button.hidden=!visible;
     button.setAttribute("aria-hidden",String(!visible));
     if(visible)button.style.removeProperty("display");
     else button.style.setProperty("display","none","important");
   });
   $("createGroupChat").hidden=adminMain;
   if(adminMain){
     document.querySelectorAll(".tab-button").forEach(x=>x.classList.remove("active"));
     $("profileTab").classList.add("active");
     $("app").querySelectorAll(".tab").forEach(x=>x.hidden=x.id!=="profile");
   }
  const adminRoleOption=$("userRole").querySelector('option[value="admin"]'); if(adminRoleOption)adminRoleOption.hidden=!isSuperAdmin; const sectorAdminOption=$("userRole").querySelector('option[value="admin_setor"]'); if(sectorAdminOption)sectorAdminOption.hidden=!isAdmin; if(!isSuperAdmin&&$("userRole").value==="admin")$("userRole").value="operador";
  $("createCompaniesTab").hidden=!isSuperAdmin;
  $("createCompanyDataTab").hidden=user.role!=="admin";
  $("companies").hidden=!isSuperAdmin;
  $("sectors").hidden=!isAdmin||(isSuperAdmin&&!selectedCompanyId);
  $("users").hidden=!isAdmin||(isSuperAdmin&&!selectedCompanyId);
  $("deliveryForm").hidden=user.role!=="admin";
  loadChatCompanies();
  if(isAdmin){loadPendingUsers();} if(user.role==="admin")loadCompanyData();
  if(isSuperAdmin){
    loadCompaniesList();
    // Sem empresa selecionada, o administrador geral trabalha na visão consolidada de todas as empresas.
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
        cnpj: $("companyCnpj").value,
        address: $("companyAddress").value,
        neighborhood: $("companyNeighborhood").value,
        city: $("companyCity").value,
        contract: await readCompanyContract(),
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
  const info=document.createElement("div");info.className="management-info";info.textContent=company.name+" ("+company.slug+") | CNPJ: "+(company.cnpj||"Não informado")+" | "+[company.address,company.neighborhood,company.city].filter(Boolean).join(", ");
  const state=document.createElement("span");state.className="management-status";state.textContent=company.active===false?"Pausada":"Ativa";
  const actions=document.createElement("div");actions.className="management-actions";
  actions.append(makeBtn("Editar","",async()=>{const name=prompt("Nome da empresa:",company.name);if(name===null)return;const cnpj=prompt("CNPJ (somente números ou formatado):",company.cnpj||"");if(cnpj===null)return;const address=prompt("Endereço:",company.address||"");if(address===null)return;const neighborhood=prompt("Bairro:",company.neighborhood||"");if(neighborhood===null)return;const city=prompt("Cidade:",company.city||"");if(city===null)return;const slug=prompt("Identificador:",company.slug);if(slug===null)return;try{await api("/companies/"+company._id,{method:"PATCH",body:JSON.stringify({name,cnpj,address,neighborhood,city,slug})});await loadGlobalCompaniesUsersReport();message("Empresa atualizada.");}catch(err){message(err.message,true);}}));
   if(company.contract?.fileName)actions.append(makeBtn("Ver contrato","",async()=>{try{await openCompanyContract(company._id);}catch(err){message(err.message,true);}}));
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
async function loadCompanyData(){
 try{
  const companies=await api("/companies");const box=$("companyDataList");box.replaceChildren();
  if(!companies.length){box.textContent="Nenhum dado cadastral encontrado.";return;}
  const company=companies[0];const row=document.createElement("div");row.className="management-row";
  const details=document.createElement("span");details.textContent=company.name+" | CNPJ: "+(company.cnpj||"Não informado")+" | "+[company.address,company.neighborhood,company.city].filter(Boolean).join(", ");row.appendChild(details);
  const edit=document.createElement("button");edit.type="button";edit.textContent="Editar dados";edit.addEventListener("click",async()=>{
   const name=prompt("Razão social / nome:",company.name);if(name===null)return;
   const cnpj=prompt("CNPJ:",company.cnpj||"");if(cnpj===null)return;
   const address=prompt("Endereço:",company.address||"");if(address===null)return;
   const neighborhood=prompt("Bairro:",company.neighborhood||"");if(neighborhood===null)return;
   const city=prompt("Cidade:",company.city||"");if(city===null)return;
   try{await api("/companies/"+company._id,{method:"PATCH",body:JSON.stringify({name,cnpj,address,neighborhood,city})});message("Dados cadastrais atualizados.");await loadCompanyData();}catch(err){message(err.message,true);}
  });row.appendChild(edit);
  if(company.contract?.fileName){const view=document.createElement("button");view.type="button";view.textContent="Ver contrato";view.addEventListener("click",async()=>{try{await openCompanyContract(company._id);}catch(err){message(err.message,true);}});row.appendChild(view);}
  box.appendChild(row);
 }catch(err){message(err.message,true);}
}
$("companySearch")?.addEventListener("input",()=>{const q=$("companySearch").value.toLocaleLowerCase("pt-BR");$("companyList").querySelectorAll(".management-row").forEach(row=>row.hidden=!row.textContent.toLocaleLowerCase("pt-BR").includes(q));});
async function loadCompaniesList() {
  try {
    const companies = await api("/companies");
    const box = $("companyList");
    box.replaceChildren();
    if (!companies.length) { box.textContent = "Nenhuma empresa cadastrada."; return; }
    companies.forEach(company => {
      const item=document.createElement("div");item.className="management-row";
      const label=document.createElement("span");label.textContent=company.name+" ("+company.slug+") — "+(company.active===false?"inativa":"ativa")+" | CNPJ: "+(company.cnpj||"—")+" | "+[company.address,company.neighborhood,company.city].filter(Boolean).join(", ");item.appendChild(label);
      if(company.contract?.fileName){const contract=document.createElement("button");contract.type="button";contract.textContent="Ver contrato";contract.addEventListener("click",async()=>{try{await openCompanyContract(company._id);}catch(err){message(err.message,true);}});item.appendChild(contract);}
      const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";edit.addEventListener("click",async()=>{const name=prompt("Nome da empresa:",company.name);if(name===null)return;const slug=prompt("Identificador:",company.slug);if(slug===null)return;try{await api("/companies/"+company._id,{method:"PATCH",body:JSON.stringify({name,slug})});await loadCompaniesList();message("Empresa atualizada.");}catch(err){message(err.message,true);}});item.appendChild(edit);
      const action=document.createElement("button");action.type="button";action.textContent=company.active===false?"Reativar":"Excluir";action.className=company.active===false?"":"danger";action.addEventListener("click",async()=>{if(!confirm((company.active===false?"Reativar":"Desativar")+" a empresa "+company.name+"?"))return;try{await api("/companies/"+company._id+(company.active===false?"/restore":"/deactivate"),{method:"PATCH"});await loadCompaniesList();await loadGlobalCompanySelector();message("Situação da empresa atualizada.");}catch(err){message(err.message,true);}});item.appendChild(action);box.appendChild(item);
    });
  } catch (err) { message(err.message, true); }
}

// Alteração de senha disponível para todos os perfis, limitada à própria conta.
function closeChangePassword(){
  $("changePasswordPanel").hidden=true;
  $("app").querySelectorAll(".tab").forEach(section=>section.hidden=section.id!=="profile");
  document.querySelectorAll(".tab-button").forEach(button=>button.classList.toggle("active",button.dataset.tab==="profile"));
  $("showChangePassword").setAttribute("aria-expanded","false");
}
$("showChangePassword").addEventListener("click",()=>{
  $("app").querySelectorAll(".tab").forEach(section=>section.hidden=true);
  document.querySelectorAll(".tab-button").forEach(button=>button.classList.toggle("active",button.dataset.tab==="profile"));
  $("changePasswordPanel").hidden=false;
  $("showChangePassword").setAttribute("aria-expanded","true");
  $("currentPassword").focus();
});
$("cancelChangePassword").addEventListener("click",closeChangePassword);
$("changePasswordForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const currentPassword=$("currentPassword").value;
  const newPassword=$("newPassword").value;
  if(newPassword!==$("confirmNewPassword").value){message("A confirmação da nova senha não confere.",true);return;}
  if(newPassword.length<8){message("A nova senha deve ter pelo menos 8 caracteres.",true);return;}
  const submit=e.submitter;if(submit)submit.disabled=true;
  try{
    const result=await api("/auth/change-password",{method:"POST",body:JSON.stringify({currentPassword,newPassword})});
    e.target.reset();
    closeChangePassword();
    message(result.message);
  }catch(err){message(err.message,true);}
  finally{if(submit)submit.disabled=false;}
});
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/auth/login",{method:"POST",body:JSON.stringify({email:$("email").value,login:$("email").value,password:$("password").value})});token=d.token;localStorage.setItem("stok_token",token);if(d.pending||d.user.approvalStatus==="pending"){showPending(d.user);message(d.message||"Aguardando aprovação.");}else{showLoggedIn(d.user);message("Login realizado.");}}catch(err){message(err.message,true);}});
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
function setCreateSection(section){
 const allowed={users:["admin","superadmin"].includes(currentUser?.role)&&(currentUser?.role!=="superadmin"||!!selectedCompanyId),sectors:["admin","superadmin"].includes(currentUser?.role)&&(currentUser?.role!=="superadmin"||!!selectedCompanyId),companies:currentUser?.role==="superadmin",companyData:currentUser?.role==="admin"};
 $("createCompanyRequired").hidden=!(currentUser?.role==="superadmin"&&!selectedCompanyId);
 if(!allowed[section])section=allowed.users?"users":allowed.sectors?"sectors":allowed.companies?"companies":"companyData";
 ["users","sectors","companies","companyData"].forEach(key=>{const node=$(key);if(node)node.hidden=key!==section||!allowed[key];});
 document.querySelectorAll("[data-create-section]").forEach(button=>button.classList.toggle("active",button.dataset.createSection===section));
 if(section==="users")loadUsersList();
 if(section==="sectors")loadSectors();
 if(section==="companies"&&currentUser?.role==="superadmin")loadCompaniesList();
 if(section==="companyData"&&currentUser?.role==="admin")loadCompanyData();
}
document.querySelectorAll("[data-create-section]").forEach(button=>button.addEventListener("click",()=>setCreateSection(button.dataset.createSection)));
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{
  const companyRequired=["products","deliveries","authorizations","activities"].includes(b.dataset.tab);
  if(currentUser?.role==="superadmin"&&companyRequired&&!selectedCompanyId&&!(b.dataset.tab==="reports"&&$("reportAllCompanies").checked)){
    message("Administrador geral: escolha uma empresa no campo Empresa em administração antes de abrir esta área.",true);
    return;
  }
  document.querySelectorAll(".tab").forEach(x=>x.hidden=x.id!==b.dataset.tab);
  document.querySelectorAll(".tab-button").forEach(x=>x.classList.toggle("active",x===b));
  if(b.dataset.tab==="profile")renderProfile(currentUser);
  if(b.dataset.tab==="management"){if(currentUser?.role==="superadmin")loadManagementCompanies();if(currentUser?.role==="superadmin")loadManagementReport();}
  if(b.dataset.tab==="history")loadHistory();
  if(b.dataset.tab==="globalReport"&&currentUser?.role==="superadmin")loadGlobalCompaniesUsersReport();
  if(b.dataset.tab==="dashboard")loadDashboard();
  if(b.dataset.tab==="products")loadProducts();
  if(b.dataset.tab==="deliveries")loadDeliveries();
  if(b.dataset.tab==="create"){setCreateSection("users");loadSectors();loadUsersList();if(currentUser?.role==="superadmin")loadCompaniesList();}
  if(b.dataset.tab==="databaseTools"){loadRegistryReport();}
  if(b.dataset.tab==="chat"){loadChatCompanies();loadChatContacts();loadChatMessages();}
  if(b.dataset.tab==="approvals")loadPendingUsers();
  if(b.dataset.tab==="authorizations")loadAuthorizations();
  if(b.dataset.tab==="activities")loadActivities();
  if(b.dataset.tab==="reports")loadReports();
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
    if(!selectedCompanyId){
     message("Visão geral: o painel e os relatórios consideram todas as empresas.");
     if(!$("dashboard").hidden)loadDashboard();
     if(!$("reports").hidden)loadReports();
     return;
    }
    loadSectors();loadProducts();loadHistory();loadDeliveries();loadAuthorizations();loadUsersList();
    if(!$("dashboard").hidden)loadDashboard();
    if(!$("reports").hidden)loadReports();
   });
  }
  select.replaceChildren();
  const empty=document.createElement("option");empty.value="";empty.textContent="Todas as empresas (visão geral)";select.appendChild(empty);
  companies.filter(c=>c.active!==false).forEach(c=>{const o=document.createElement("option");o.value=c._id;o.textContent=c.name;select.appendChild(o);});
  if(companies.some(c=>c._id===previousSelection&&c.active!==false)){selectedCompanyId=previousSelection;select.value=selectedCompanyId;}
  else {selectedCompanyId="";localStorage.removeItem("stok_company_id");select.value="";}
  $("sectors").hidden=!selectedCompanyId; $("users").hidden=!selectedCompanyId;
  if(selectedCompanyId){loadSectors();}else message("Visão geral: sem empresa selecionada, os indicadores e relatórios abrangem todas as empresas.");
 }catch(err){message(err.message,true);}
}

// Painel de gestão: usa somente dados filtrados e autorizados pela API.
let dashboardData=null;
let dashboardSectors=[];
let dashboardReportType="users";
function dashboardDate(value){if(!value)return "Nunca";const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleString("pt-BR");}
function dashboardKpi(label,value,detail){const card=document.createElement("article");card.className="dashboard-kpi";const strong=document.createElement("strong");strong.textContent=String(value);const title=document.createElement("span");title.textContent=label;const note=document.createElement("small");note.textContent=detail||"";card.append(strong,title,note);return card;}
function dashboardTable(rows,columns){const table=document.createElement("table"),head=document.createElement("thead"),hr=document.createElement("tr");columns.forEach(c=>{const th=document.createElement("th");th.textContent=c.label;hr.appendChild(th);});head.appendChild(hr);table.appendChild(head);const body=document.createElement("tbody");rows.forEach(row=>{const tr=document.createElement("tr");columns.forEach(c=>{const td=document.createElement("td");td.textContent=String(c.value(row)??"—");tr.appendChild(td);});body.appendChild(tr);});if(!rows.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=columns.length;td.textContent="Nenhum registro para os filtros selecionados.";tr.appendChild(td);body.appendChild(tr);}table.appendChild(body);return table;}
function deriveDashboardSectors(data){
 const names=new Set();
 (data.users||[]).forEach(x=>{if(x.sector)names.add(x.sector);});
 (data.products||[]).forEach(x=>{if(x.responsibleSector)names.add(x.responsibleSector);if(x.createdSector)names.add(x.createdSector);});
 (data.movements||[]).forEach(x=>{[x.sector,x.sourceSector,x.destinationSector,x.actionSector].filter(Boolean).forEach(v=>names.add(v));});
 return [...names].sort((a,b)=>a.localeCompare(b,"pt-BR")).map(name=>({name,active:true}));
}
function ensureCompanyReportScope(data){
 if(currentUser?.role!=="admin")return data;
 const ownCompany=String(currentUser.companyId?._id||currentUser.companyId||"");
 const responseCompany=String(data?.selectedCompanyId||"");
 if(!ownCompany||data?.scope!=="COMPANY"||responseCompany!==ownCompany){
  throw new Error("Consulta bloqueada: este relatório não confirmou o vínculo exclusivo com a sua empresa.");
 }
 return data;
}
async function loadDashboard(){
 const status=$("dashboardStatus");if(!status)return;
 try{
  status.textContent="Consultando os dados autorizados...";
  const allCompanies=currentUser?.role==="superadmin"&&!selectedCompanyId;
  const query=currentUser?.role==="superadmin"&&selectedCompanyId?"?companyId="+encodeURIComponent(selectedCompanyId):"";
  const [data,sectors]=await Promise.all([api("/reports/overview"+query),allCompanies?Promise.resolve([]):api("/sectors")]);
  ensureCompanyReportScope(data);
  dashboardData=data;
  dashboardSectors=sectors.length?sectors:deriveDashboardSectors(data);
  const sectorSelect=$("dashboardSector"),previous=sectorSelect.value;sectorSelect.replaceChildren();
  const all=document.createElement("option");all.value="";all.textContent="Todos os setores permitidos";sectorSelect.appendChild(all);
  dashboardSectors.filter(s=>s.active!==false).forEach(s=>{const o=document.createElement("option");o.value=s.name;o.textContent=s.name;sectorSelect.appendChild(o);});
  if(currentUser?.role==="admin_setor"){sectorSelect.value=currentUser.sector||"";sectorSelect.disabled=true;}
  else {sectorSelect.disabled=false;if(dashboardSectors.some(s=>s.name===previous&&s.active!==false))sectorSelect.value=previous;}
  renderDashboard();
  status.textContent="Painel atualizado em "+new Date().toLocaleString("pt-BR")+". Escopo: "+(data.scope==="SECTOR"?"seu setor":data.scope==="ALL_COMPANIES"?"todas as empresas":"empresa selecionada")+".";
 }catch(err){status.textContent=err.message;message(err.message,true);}
}
function renderDashboard(){
 if(!dashboardData)return;
 const from=$("dashboardFrom").value?new Date($("dashboardFrom").value+"T00:00:00"):null;
 const to=$("dashboardTo").value?new Date($("dashboardTo").value+"T23:59:59.999"):null;
 const sector=dashboardData.scope==="ALL_COMPANIES"?"":$("dashboardSector").value;
 if(dashboardData.scope==="ALL_COMPANIES"){
  const s=dashboardData.summary||{};
  $("dashboardKpis").replaceChildren(dashboardKpi("Empresas cadastradas",s.companies??0,"Empresas não excluídas"),dashboardKpi("Produtos ativos",s.products??0,"Mercadorias e bens ativos"),dashboardKpi("Movimentações",s.movements??0,"Registros de movimentação"),dashboardKpi("Usuários cadastrados",s.users??0,"Contas vinculadas às empresas"));
  $("dashboardRegistrations").replaceChildren(dashboardTable([{label:"Empresas",value:s.companies??0},{label:"Produtos ativos",value:s.products??0},{label:"Movimentações registradas",value:s.movements??0},{label:"Usuários cadastrados",value:s.users??0}],[{label:"Indicador geral",value:x=>x.label},{label:"Total",value:x=>x.value}]));
  $("dashboardMovementBalance").replaceChildren(dashboardTable([{label:"Movimentações registradas",value:s.movements??0}],[{label:"Indicador",value:x=>x.label},{label:"Total",value:x=>x.value}]));
  $("dashboardAccessTable").replaceChildren(dashboardTable(dashboardData.users||[],[{label:"Usuário",value:x=>x.name},{label:"Empresa",value:x=>x.companyName||"—"},{label:"Perfil",value:x=>x.role},{label:"Setor",value:x=>x.sector||"—"},{label:"Situação",value:x=>x.active===false?"Inativo":x.approvalStatus==="pending"?"Aguardando aprovação":"Ativo"}]));
  renderDashboardReport();
  return;
 }
 const inRange=row=>{const d=new Date(row.createdAt||0);return (!from||d>=from)&&(!to||d<=to)&&(!sector||[row.sector,row.sourceSector,row.destinationSector,row.actionSector,row.createdSector,row.responsibleSector].includes(sector));};
 const movements=(dashboardData.movements||[]).filter(inRange);
 const users=(dashboardData.users||[]).filter(x=>!sector||x.sector===sector);
 const products=(dashboardData.products||[]).filter(x=>!sector||x.responsibleSector===sector);
 const entries=movements.filter(x=>x.action==="ENTRADA"),exits=movements.filter(x=>String(x.action||"").startsWith("SAIDA"));
 const quantity=rows=>rows.reduce((sum,x)=>sum+Number(x.quantity||0),0);
 const registrations=$("dashboardRegistrations");registrations.replaceChildren();
 const sectorsInScope=new Set(users.map(x=>x.sector).filter(Boolean));
 const activeUsers=users.filter(x=>x.active!==false);
 const activeProducts=products.filter(x=>x.active!==false);
 const roles={admin:"Administradores da empresa",admin_setor:"Administradores de setor",operador:"Operadores"};
 const roleCounts=Object.keys(roles).map(role=>({role,label:roles[role],count:activeUsers.filter(x=>x.role===role).length}));
 registrations.appendChild(dashboardTable([
  {label:"Setores com usuários",value:sectorsInScope.size},
  {label:"Usuários ativos",value:activeUsers.length},
  {label:"Produtos e bens ativos",value:activeProducts.length},
  ...roleCounts.map(x=>({label:x.label,value:x.count}))
 ],[{label:"Cadastro",value:x=>x.label},{label:"Quantidade",value:x=>x.value}]));
 const kpis=$("dashboardKpis");kpis.replaceChildren(
  dashboardKpi("Movimentações no período",movements.length,"Registros no histórico"),
  dashboardKpi("Entradas",quantity(entries),"Quantidade total recebida"),
  dashboardKpi("Saídas",quantity(exits),"Quantidade total retirada"),
  dashboardKpi("Saldo atual cadastrado",quantity(activeProducts.filter(x=>x.category!=="BEM")),"Soma das quantidades dos produtos de consumo")
 );
 const balance=$("dashboardMovementBalance");balance.replaceChildren(dashboardTable([
  {action:"Entradas",count:entries.length,total:quantity(entries)},
  {action:"Saídas",count:exits.length,total:quantity(exits)},
  {action:"Transferências",count:movements.filter(x=>/TRANSFER|ENTREGA_SETOR/.test(x.action||"")).length,total:quantity(movements.filter(x=>/TRANSFER|ENTREGA_SETOR/.test(x.action||"")))},
  {action:"Desfazimentos",count:movements.filter(x=>x.action==="DESFAZIMENTO").length,total:quantity(movements.filter(x=>x.action==="DESFAZIMENTO"))}
 ],[{label:"Operação",value:x=>x.action},{label:"Registros",value:x=>x.count},{label:"Quantidade",value:x=>x.total}]));
 const access=$("dashboardAccessTable");access.replaceChildren(dashboardTable(users,[{label:"Usuário",value:x=>x.name},{label:"E-mail",value:x=>x.email},{label:"Perfil",value:x=>roles[x.role]||x.role},{label:"Setor",value:x=>x.sector||"—"},{label:"Situação",value:x=>x.active===false?"Inativo":x.approvalStatus==="pending"?"Aguardando aprovação":"Ativo"},{label:"Último acesso",value:x=>dashboardDate(x.lastLoginAt)},{label:"Total de acessos",value:x=>x.loginCount||0}]));
 renderDashboardReport();
}

function renderDashboardReport(){
 const target=$("dashboardReportResults"),status=$("dashboardReportStatus");
 if(!target||!dashboardData)return;
 const from=$("dashboardFrom").value?new Date($("dashboardFrom").value+"T00:00:00"):null;
 const to=$("dashboardTo").value?new Date($("dashboardTo").value+"T23:59:59.999"):null;
 const sector=$("dashboardSector").value;
 const term=($("dashboardReportSearch").value||"").trim().toLocaleLowerCase("pt-BR");
 let rows=[],columns=[];
 if(dashboardReportType==="users"){
  rows=dashboardData.users||[];
  columns=[{label:"Empresa",value:r=>r.companyName||"—"},{label:"Usuário",value:r=>r.name},{label:"E-mail",value:r=>r.email},{label:"Perfil",value:r=>r.role},{label:"Setor",value:r=>r.sector||"—"},{label:"Situação",value:r=>r.active===false?"Inativo":r.approvalStatus==="pending"?"Pendente":"Ativo"},{label:"Cadastro",value:r=>reportDate(r.createdAt)}];
 }else if(dashboardReportType==="sectors"){
  rows=dashboardSectors;
  columns=[{label:"Setor",value:r=>r.name},{label:"Situação",value:r=>r.active===false?"Inativo":"Ativo"}];
 }else if(dashboardReportType==="movements"){
  rows=dashboardData.movements||[];
  columns=[{label:"Empresa",value:r=>r.companyName||"—"},{label:"Data/hora",value:r=>reportDate(r.createdAt)},{label:"Operação",value:r=>r.action},{label:"Produto",value:r=>r.productName},{label:"Quantidade",value:r=>r.quantity},{label:"Origem",value:r=>r.sourceSector||"—"},{label:"Destino",value:r=>r.destinationSector||"—"},{label:"Responsável",value:r=>r.userName||r.requestedByName||"—"}];
 }else{
  rows=dashboardData.products||[];
  columns=[{label:"Empresa",value:r=>r.companyName||"—"},{label:"Produto",value:r=>r.name},{label:"Tipo",value:r=>r.category||"—"},{label:"Setor responsável",value:r=>r.responsibleSector||"—"},{label:"Quantidade",value:r=>r.quantity},{label:"Cadastrado por",value:r=>r.createdByName||"—"},{label:"Cadastro",value:r=>reportDate(r.createdAt)}];
 }
 rows=rows.filter(r=>{
  const dateValue=r.createdAt||r.updatedAt;
  if(dateValue&&(from||to)){const date=new Date(dateValue);if((from&&date<from)||(to&&date>to))return false;}
  if(sector){
   if(dashboardReportType==="sectors"&&r.name!==sector)return false;
   if(dashboardReportType==="users"&&r.sector!==sector)return false;
   if(dashboardReportType==="products"&&![r.responsibleSector,r.createdSector].includes(sector))return false;
   if(dashboardReportType==="movements"&&![r.sector,r.sourceSector,r.destinationSector,r.actionSector].includes(sector))return false;
  }
  if(term&&!JSON.stringify(r).toLocaleLowerCase("pt-BR").includes(term))return false;
  return true;
 });
 target.replaceChildren(dashboardTable(rows,columns));
 if(status)status.textContent=rows.length+" registro(s) encontrado(s) em "+({users:"usuários",sectors:"setores",movements:"movimentações",products:"produtos cadastrados"}[dashboardReportType])+".";
 document.querySelectorAll("[data-dashboard-report]").forEach(button=>button.classList.toggle("active",button.dataset.dashboardReport===dashboardReportType));
}
document.querySelectorAll("[data-dashboard-report]").forEach(button=>button.addEventListener("click",()=>{
 dashboardReportType=button.dataset.dashboardReport;
 renderDashboardReport();
}));
$("dashboardReportSearch").addEventListener("input",renderDashboardReport);

$("dashboardRefresh").addEventListener("click",loadDashboard);
$("dashboardSector").addEventListener("change",()=>{if(dashboardData){renderDashboard();renderDashboardReport();}});
$("dashboardFrom").addEventListener("change",()=>{if(dashboardData){renderDashboard();renderDashboardReport();}});
$("dashboardTo").addEventListener("change",()=>{if(dashboardData){renderDashboard();renderDashboardReport();}});

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
$("sectorSearch")?.addEventListener("input",()=>{const q=$("sectorSearch").value.toLocaleLowerCase("pt-BR");$("sectorList").querySelectorAll(".management-row").forEach(row=>row.hidden=!row.textContent.toLocaleLowerCase("pt-BR").includes(q));});
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
 const rows=cachedMovements.filter(m=>[m.action,m.productName,m.sourceSector,m.destinationSector,m.destination,m.actionSector,m.sector].join(" ").toLocaleLowerCase("pt-BR").includes(term));
 $("historyBody").replaceChildren();
 rows.forEach(m=>{const tr=document.createElement("tr");[new Date(m.createdAt).toLocaleString("pt-BR"),"STOK",m.action,m.productName,(m.quantity??"")+(m.unit?" "+m.unit:""),m.sourceSector||m.createdSector||m.sector||"—",m.destinationSector||m.destination||m.actionSector||m.sector||"—"].forEach(v=>{const td=document.createElement("td");td.textContent=v??"";tr.appendChild(td);});
  $("historyBody").appendChild(tr);});
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
  await loadRegistryReport();
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
$("registryRefresh").addEventListener("click",loadRegistryReport);
$("registrySearch").addEventListener("input",renderRegistryReport);
$("registryType").addEventListener("change",renderRegistryReport);

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
  if(!["superadmin","admin"].includes(currentUser?.role)||(currentUser.role==="superadmin"&&!selectedCompanyId))return;
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
$("userSearch")?.addEventListener("input",()=>{const q=$("userSearch").value.toLocaleLowerCase("pt-BR");$("userList").querySelectorAll(".management-row").forEach(row=>row.hidden=!row.textContent.toLocaleLowerCase("pt-BR").includes(q));});
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
  await loadChatContacts();
  await loadChatMessages();
  if(!window.stokChatTimer)window.stokChatTimer=window.setInterval(()=>{
   const chatTab=$("chat");
   if(currentUser&&chatTab&&!chatTab.hidden)loadChatMessages();
  },2000);
 }catch(err){message(err.message,true);}
}
let activeChatConversation="empresa";
let activeChatReply=null;
let chatChannels=[];

function renderChatConversationList(){
 const list=$("chatConversationList"),filter=($("chatSearch").value||"").trim().toLocaleLowerCase("pt-BR");list.replaceChildren();
 chatChannels.filter(ch=>ch.name.toLocaleLowerCase("pt-BR").includes(filter)).forEach(ch=>{
  const button=document.createElement("button");button.type="button";button.className="chat-conversation-item"+(ch.id===activeChatConversation?" active":"");
  const avatar=document.createElement("span");avatar.className="chat-list-avatar";avatar.textContent=(ch.name||"ST").split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();
  const copy=document.createElement("span");copy.className="chat-list-copy";const name=document.createElement("strong");name.textContent=ch.name;
  const detail=document.createElement("small");detail.textContent=ch.type==="direct"?"Conversa privada":ch.type==="group"?"Grupo":ch.type==="sector"?"Canal do setor":"Canal da empresa";
  copy.append(name,detail);button.append(avatar,copy);button.addEventListener("click",()=>{activeChatConversation=ch.id;$("chatConversation").value=ch.id;loadChatMessages();});list.appendChild(button);
 });
 if(!list.children.length){const empty=document.createElement("p");empty.className="chat-list-empty";empty.textContent="Nenhuma conversa encontrada.";list.appendChild(empty);}
}
$("chatSearch").addEventListener("input",renderChatConversationList);
async function loadChatContacts(){
 try{
  if(!$("chatCompany").value)return;
  const query=currentUser.role==="superadmin"?"?companyId="+encodeURIComponent($("chatCompany").value):"";
  let users=await api("/chat/contacts"+query);if(["admin","superadmin"].includes(currentUser.role))users=users.filter(user=>currentUser.role==="superadmin"?user.role==="admin":user.role==="superadmin");const select=$("chatContacts"),previous=new Set([...select.selectedOptions].map(x=>x.value));
  select.replaceChildren();
  users.forEach(user=>{const option=document.createElement("option");option.value=user._id;option.textContent=user.name+" — "+user.sector+" ("+user.role+")";option.selected=previous.has(user._id);select.appendChild(option);});
 }catch(err){message(err.message,true);}
}
async function createChatConversation(type){
 try{
  const participants=[...$("chatContacts").selectedOptions].map(x=>x.value);
  if(["admin","superadmin"].includes(currentUser.role)&&type!=="DIRECT"){message("O chat dos administradores é uma conversa privada entre o administrador geral e o administrador da empresa.",true);return;}
  if(type==="DIRECT"&&participants.length!==1){message("Selecione exatamente uma pessoa para a conversa privada.",true);return;}
  if(type==="GROUP"&&participants.length<1){message("Selecione pelo menos uma pessoa para o grupo.",true);return;}
  if(type==="GROUP"&&!$("chatGroupName").value.trim()){message("Informe um nome para o grupo.",true);$("chatGroupName").focus();return;}
  const payload={type,participants,name:$("chatGroupName").value};
  if(currentUser.role==="superadmin")payload.companyId=$("chatCompany").value;
  const created=await api("/chat/conversations",{method:"POST",body:JSON.stringify(payload)});
  activeChatConversation=created.channelKey;await loadChatMessages();
  message(type==="DIRECT"?"Conversa privada criada.":"Grupo criado.");
 }catch(err){message(err.message,true);}
}
$("createDirectChat").addEventListener("click",()=>createChatConversation("DIRECT"));
$("createGroupChat").addEventListener("click",()=>createChatConversation("GROUP"));
async function loadChatMessages(){
 try{
  if(!$("chatCompany").value)return;
  const companyId=$("chatCompany").value;
  const companyQuery=currentUser.role==="superadmin"?"?companyId="+encodeURIComponent(companyId):"";
  chatChannels=await api("/chat/conversations"+companyQuery);
  const channelSelect=$("chatConversation"),old=activeChatConversation;
  channelSelect.replaceChildren();
  chatChannels.forEach(ch=>{const o=document.createElement("option");o.value=ch.id;o.textContent=ch.name;channelSelect.appendChild(o);});
  activeChatConversation=chatChannels.some(ch=>ch.id===old)?old:(chatChannels[0]?.id||"empresa");
  channelSelect.value=activeChatConversation;
  renderChatConversationList();
  const activeChannel=chatChannels.find(ch=>ch.id===activeChatConversation);
  $("chatActiveTitle").textContent=activeChannel?.name||"Conversa";
  $("chatActiveSubtitle").textContent=activeChannel?.type==="direct"?"Conversa privada":activeChannel?.type==="group"?"Grupo interno":activeChannel?.type==="sector"?"Canal do setor":"Canal interno da empresa";
  $("chatAvatar").textContent=(activeChannel?.name||"ST").split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();
  const query=(currentUser.role==="superadmin"?"?companyId="+encodeURIComponent(companyId)+"&":"?")+"conversationId="+encodeURIComponent(activeChatConversation);
  const messages=await api("/chat/messages"+query),box=$("chatMessages");box.replaceChildren();
  const messageMap=new Map(messages.map(x=>[String(x._id),x]));
  messages.forEach(item=>{
   const article=document.createElement("article");article.className="chat-message "+(String(item.senderId)===String(currentUser._id)?"chat-message-own":"chat-message-other");
   const roleLabel=item.senderRole==="superadmin"?"Administrador geral STOK":item.senderRole==="admin"?"Administrador da empresa":item.senderRole==="admin_setor"?"Administrador do setor":"Operador";
   const heading=document.createElement("strong");heading.textContent=item.senderName+" — "+roleLabel+(item.senderSector?" • "+item.senderSector:"");
   const body=document.createElement("p");body.textContent=item.deletedAt?"Mensagem removida":item.message;
   const date=document.createElement("small");date.textContent=new Date(item.createdAt).toLocaleString("pt-BR")+(item.editedAt?" • editada":"")+(String(item.senderId)===String(currentUser._id)&&(item.readBy||[]).length>1?" • lida":"");
   article.appendChild(heading);
   if(item.replyTo&&messageMap.has(String(item.replyTo))){const original=messageMap.get(String(item.replyTo));const quote=document.createElement("blockquote");quote.className="chat-reply-quote";quote.textContent="Resposta a "+original.senderName+": "+original.message;article.appendChild(quote);}
   article.append(body,date);
   if(!item.deletedAt){
    const actions=document.createElement("div");actions.className="chat-actions";
    const reply=document.createElement("button");reply.type="button";reply.textContent="Responder";reply.className="secondary";
    reply.addEventListener("click",()=>{activeChatReply=item._id;$("chatReplyInfo").hidden=false;$("chatCancelReply").hidden=false;$("chatReplyInfo").textContent="Respondendo a "+item.senderName+": "+item.message.slice(0,90);$("chatText").focus();});
    actions.appendChild(reply);
    if(String(item.senderId)===String(currentUser._id)||["admin","superadmin"].includes(currentUser.role)||(currentUser.role==="admin_setor"&&item.senderSector===currentUser.sector)){
     const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";edit.className="secondary";
     edit.addEventListener("click",async()=>{const next=prompt("Edite sua mensagem:",item.message);if(next===null)return;try{await api("/chat/messages/"+item._id,{method:"PATCH",body:JSON.stringify({message:next,companyId})});await loadChatMessages();}catch(err){message(err.message,true);}});
     const del=document.createElement("button");del.type="button";del.textContent="Apagar";del.className="danger";
     del.addEventListener("click",async()=>{if(!confirm("Apagar esta mensagem? O registro de auditoria será preservado."))return;try{await api("/chat/messages/"+item._id,{method:"DELETE",body:JSON.stringify({companyId})});await loadChatMessages();}catch(err){message(err.message,true);}});
     actions.append(edit,del);
    }
    article.appendChild(actions);
   }
   box.appendChild(article);
   if(!item.deletedAt&&String(item.senderId)!==String(currentUser._id)&&!(item.readBy||[]).some(x=>String(x.userId)===String(currentUser._id)))api("/chat/messages/"+item._id+"/read",{method:"POST",body:JSON.stringify({companyId})}).catch(()=>{});
  });
  box.scrollTop=box.scrollHeight;
 }catch(err){message(err.message,true);}
}
$("chatCompany").addEventListener("change",()=>{activeChatConversation="empresa";loadChatContacts();loadChatMessages();});
$("chatConversation").addEventListener("change",()=>{activeChatConversation=$("chatConversation").value;loadChatMessages();});
$("chatCancelReply").addEventListener("click",()=>{activeChatReply=null;$("chatReplyInfo").hidden=true;$("chatCancelReply").hidden=true;});
$("refreshChat").addEventListener("click",loadChatMessages);
$("chatText").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("chatForm").requestSubmit();}});
$("chatForm").addEventListener("submit",async e=>{
 e.preventDefault();try{
  const payload={message:$("chatText").value,conversationId:activeChatConversation,replyTo:activeChatReply};
  if(currentUser.role==="superadmin")payload.companyId=$("chatCompany").value;
  await api("/chat/messages",{method:"POST",body:JSON.stringify(payload)});
  $("chatText").value="";activeChatReply=null;$("chatReplyInfo").hidden=true;$("chatCancelReply").hidden=true;await loadChatMessages();message("Mensagem enviada.");
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
    const info=document.createElement("p");info.textContent=type+" — "+status+" | Empresa: "+(item.companyName||item.company?.name||"Empresa não identificada")+" | Solicitante: "+item.requesterName+" | Setor: "+item.requesterSector;
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

let activityCache=[];
async function loadActivities(){
 try{
  const query=currentUser?.role==="superadmin"&&selectedCompanyId?"?companyId="+encodeURIComponent(selectedCompanyId):"";
  const [rows,sectors,assignees]=await Promise.all([api("/activities"+query),api("/sectors"),api("/activities/assignees"+query)]);
  activityCache=rows;
  const sectorSelect=$("activitySector"),previous=sectorSelect.value;
  sectorSelect.replaceChildren();
  const allowedSectors=currentUser?.role==="superadmin"||currentUser?.role==="admin"?sectors:sectors.filter(x=>x.name===currentUser?.sector);
  allowedSectors.filter(x=>x.active!==false).forEach(x=>{const o=document.createElement("option");o.value=x.name;o.textContent=x.name;sectorSelect.appendChild(o);});
  if(previous&&[...sectorSelect.options].some(o=>o.value===previous))sectorSelect.value=previous;
  if(currentUser?.role==="operador"||currentUser?.role==="admin_setor")sectorSelect.value=currentUser.sector||"";
  sectorSelect.disabled=["operador","admin_setor"].includes(currentUser?.role);
  const fillAssignees=()=>{
   const select=$("activityAssignees");select.replaceChildren();
   const sector=sectorSelect.value;
   assignees.filter(x=>x.sector===sector).forEach(x=>{const o=document.createElement("option");o.value=x._id;o.textContent=x.name+" — "+x.role;select.appendChild(o);});
  };
  sectorSelect.onchange=fillAssignees;fillAssignees();
  renderActivities();
 }catch(err){message(err.message,true);}
}
function renderActivities(){
 const groups={A_FAZER:$("activityTodo"),FAZENDO:$("activityDoing"),FEITO:$("activityDone")};
 Object.values(groups).forEach(x=>x.replaceChildren());
 const counts={A_FAZER:0,FAZENDO:0,FEITO:0};
 activityCache.forEach(item=>{
  const status=item.status||"A_FAZER";if(!groups[status])return;counts[status]++;
  const card=document.createElement("article");card.className="activity-card";
  const title=document.createElement("h4");title.textContent=item.title;
  const desc=document.createElement("p");desc.textContent=item.description||"Sem descrição";
  const meta=document.createElement("small");meta.textContent="Setor: "+item.sector+" | Prioridade: "+item.priority+" | Criada por: "+item.createdByName;
  const people=document.createElement("small");people.textContent="Responsáveis: "+((item.assignedNames||[]).join(", ")||"Não atribuída");
  const due=document.createElement("small");due.textContent="Prazo: "+(item.dueDate?new Date(item.dueDate).toLocaleDateString("pt-BR"):"Não definido");
  card.append(title,desc,meta,people,due);
  if(status!=="A_FAZER")card.appendChild(activityAction("← A fazer",()=>changeActivity(item,"A_FAZER"),"secondary"));
  if(status!=="FAZENDO")card.appendChild(activityAction("Fazendo",()=>changeActivity(item,"FAZENDO"),"secondary"));
  if(status!=="FEITO")card.appendChild(activityAction("Concluir",()=>changeActivity(item,"FEITO"),""));
  if(["admin","admin_setor","superadmin"].includes(currentUser?.role))card.appendChild(activityAction("Excluir",()=>deleteActivity(item),"danger"));
  groups[status].appendChild(card);
 });
 $("activityCountTodo").textContent=counts.A_FAZER;$("activityCountDoing").textContent=counts.FAZENDO;$("activityCountDone").textContent=counts.FEITO;
 $("activitySummary").textContent=activityCache.length+" atividade(s) visível(is).";
}
function activityAction(label,fn,cls){
 const b=document.createElement("button");b.type="button";b.textContent=label;b.className=cls||"";b.addEventListener("click",fn);return b;
}
async function changeActivity(item,status){
 try{await api("/activities/"+item._id,{method:"PATCH",body:JSON.stringify({status})});await loadActivities();message("Situação da atividade atualizada.");}
 catch(err){message(err.message,true);}
}
async function deleteActivity(item){
 if(!confirm("Excluir logicamente a atividade '"+item.title+"'? O histórico será preservado."))return;
 try{const d=await api("/activities/"+item._id,{method:"DELETE"});await loadActivities();message(d.message);}
 catch(err){message(err.message,true);}
}
$("activityForm").addEventListener("submit",async e=>{
 e.preventDefault();
 try{
  const assignedTo=[...$("activityAssignees").selectedOptions].map(o=>o.value);
  const data={title:$("activityTitle").value,description:$("activityDescription").value,sector:$("activitySector").value,priority:$("activityPriority").value,dueDate:$("activityDueDate").value||null,assignedTo};
  const result=await api("/activities",{method:"POST",body:JSON.stringify(data)});
  e.target.reset();await loadActivities();message("Atividade criada e registrada. "+(result.title||""));
 }catch(err){message(err.message,true);}
});
$("activityRefresh").addEventListener("click",loadActivities);

let latestReportData=null;
function reportDate(value){return value?new Date(value).toLocaleString("pt-BR"):"—";}
function reportCell(value){return value===null||value===undefined||value===""?"—":String(value);}
function reportActionsAllowed(row){
 if(!currentUser||!["superadmin","admin"].includes(currentUser.role))return false;
 const companyId=String(row.companyId?._id||row.companyId||row._id||"");
 if(currentUser.role==="admin")return companyId===String(currentUser.companyId?._id||currentUser.companyId||"");
 const allCompanies=$("reportAllCompanies")?.checked||!selectedCompanyId;
 return allCompanies||companyId===String(selectedCompanyId);
}
async function reportScopedApi(row,path,options={}){
 const companyId=String(row.companyId?._id||row.companyId||row._id||"");
 const headers={...(options.headers||{})};
 if(currentUser?.role==="superadmin"&&companyId)headers["X-Company-Id"]=companyId;
 return api(path,{...options,headers});
}
async function editReportUser(row){
 const name=prompt("Nome:",row.name||"");if(name===null)return;
 const email=prompt("E-mail:",row.email||"");if(email===null)return;
 const sector=prompt("Setor:",row.sector||"");if(sector===null)return;
 try{const result=await reportScopedApi(row,"/users/"+row._id,{method:"PATCH",body:JSON.stringify({name,email,sector})});message(result.message||"Usuário atualizado.");await loadReports();}
 catch(err){message(err.message,true);}
}
async function deleteReportUser(row){
 if(!confirm("Excluir o usuário "+(row.name||"")+"? O registro será preservado para auditoria."))return;
 try{const result=await reportScopedApi(row,"/users/"+row._id,{method:"DELETE"});message(result.message||"Usuário excluído.");await loadReports();}
 catch(err){message(err.message,true);}
}
async function editReportMovement(row){
 const action=prompt("Operação:",row.action||"");if(action===null)return;
 const quantity=prompt("Quantidade:",row.quantity??"");if(quantity===null)return;
 const details=prompt("Detalhes:",row.details||"");if(details===null)return;
 try{const result=await reportScopedApi(row,"/movements/"+row._id,{method:"PATCH",body:JSON.stringify({action,quantity:Number(quantity),details})});message(result.message||"Movimentação corrigida.");await loadReports();}
 catch(err){message(err.message,true);}
}
async function deleteReportMovement(row){
 if(!confirm("Excluir esta movimentação do relatório? O histórico original ficará preservado para auditoria."))return;
 try{const result=await reportScopedApi(row,"/movements/"+row._id,{method:"DELETE"});message(result.message||"Movimentação excluída.");await loadReports();}
 catch(err){message(err.message,true);}
}
async function editReportCompany(row){
 const name=prompt("Nome da empresa:",row.name||"");if(name===null)return;
 const cnpj=prompt("CNPJ:",row.cnpj||"");if(cnpj===null)return;
 const address=prompt("Endereço:",row.address||"");if(address===null)return;
 const neighborhood=prompt("Bairro:",row.neighborhood||"");if(neighborhood===null)return;
 const city=prompt("Cidade:",row.city||"");if(city===null)return;
 try{const result=await reportScopedApi(row,"/companies/"+row._id,{method:"PATCH",body:JSON.stringify({name,cnpj,address,neighborhood,city})});message(result.message||"Empresa atualizada.");await loadReports();}
 catch(err){message(err.message,true);}
}
async function deleteReportCompany(row){
 if(!confirm("Excluir a empresa "+(row.name||"")+"? Os acessos vinculados serão bloqueados e o registro ficará preservado."))return;
 try{const result=await reportScopedApi(row,"/companies/"+row._id,{method:"DELETE"});message(result.message||"Empresa excluída.");await loadReports();}
 catch(err){message(err.message,true);}
}
function renderReportTable(title,rows,columns,actions){
 const wrap=document.createElement("section");wrap.className="report-block";
 const heading=document.createElement("h3");heading.textContent=title+" ("+rows.length+")";wrap.appendChild(heading);
 if(!rows.length){const p=document.createElement("p");p.textContent="Nenhum registro encontrado.";wrap.appendChild(p);return wrap;}
 const table=document.createElement("div");table.className="table-wrap";
 const t=document.createElement("table"),thead=document.createElement("thead"),hr=document.createElement("tr");
 columns.forEach(c=>{const th=document.createElement("th");th.textContent=c.label;hr.appendChild(th);});
 if(actions){const th=document.createElement("th");th.textContent="Ações";hr.appendChild(th);}
 thead.appendChild(hr);t.appendChild(thead);
 const body=document.createElement("tbody");
 rows.forEach(row=>{
  const tr=document.createElement("tr");
  columns.forEach(c=>{const td=document.createElement("td");td.textContent=reportCell(c.value(row));tr.appendChild(td);});
  if(actions){
   const td=document.createElement("td");
   if(reportActionsAllowed(row)){
    const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";edit.addEventListener("click",()=>actions.edit(row));td.appendChild(edit);
    const remove=document.createElement("button");remove.type="button";remove.textContent="Excluir";remove.className="danger";remove.addEventListener("click",()=>actions.remove(row));td.appendChild(remove);
   }else td.textContent="Sem permissão";
   tr.appendChild(td);
  }
  body.appendChild(tr);
 });
 t.appendChild(body);table.appendChild(t);wrap.appendChild(table);return wrap;
}

async function loadManagementCompanies(){
 try{
  const select=$("managementCompanySelect"),previous=selectedCompanyId;
  const companies=await api("/chat/companies");select.replaceChildren();
  const all=document.createElement("option");all.value="";all.textContent="Todas as empresas";select.appendChild(all);
  companies.forEach(company=>{const option=document.createElement("option");option.value=company._id;option.textContent=company.name;select.appendChild(option);});
  if(companies.some(company=>company._id===previous))select.value=previous;else select.value="";
  selectedCompanyId=select.value;
  if(selectedCompanyId)localStorage.setItem("stok_company_id",selectedCompanyId);else localStorage.removeItem("stok_company_id");
 }catch(err){$("managementReportStatus").textContent=err.message;message(err.message,true);}
}
async function loadManagementReport(){
 try{
  const companyId=$("managementCompanySelect").value||"";
  selectedCompanyId=companyId;
  if(companyId)localStorage.setItem("stok_company_id",companyId);else localStorage.removeItem("stok_company_id");
  $("managementReportStatus").textContent="Consultando usuários e movimentações...";
  $("managementReportSummary").replaceChildren();$("managementReportTables").replaceChildren();
  const data=await api("/reports/overview"+(companyId?"?companyId="+encodeURIComponent(companyId):""),{headers:companyId?{"X-Company-Id":companyId}:{"X-Company-Id":""}});
  const summary=data.summary||{};
  [["Empresas",summary.companies??data.companies?.length??0],["Usuários",summary.users??data.users?.length??0],["Movimentações",summary.movements??data.movements?.length??0]].forEach(([label,value])=>{const card=document.createElement("div");card.className="report-kpi";const strong=document.createElement("strong");strong.textContent=value;const span=document.createElement("span");span.textContent=label;card.append(strong,span);$("managementReportSummary").appendChild(card);});
  const companies=data.companies||[];
  if(!companies.length){$("managementReportTables").textContent="Nenhuma empresa encontrada.";return;}
  companies.forEach(company=>{
   const group=document.createElement("section");group.className="management-company-report";
   const title=document.createElement("h3");title.textContent=company.name;group.appendChild(title);
   const users=(data.users||[]).filter(row=>String(row.companyId?._id||row.companyId)===String(company._id));
   const movements=(data.movements||[]).filter(row=>String(row.companyId?._id||row.companyId)===String(company._id));
   group.append(renderReportTable("Usuários",users,[{label:"Nome",value:r=>r.name},{label:"E-mail",value:r=>r.email},{label:"Perfil",value:r=>r.role},{label:"Setor",value:r=>r.sector},{label:"Situação",value:r=>r.active===false?"Inativo":"Ativo"}]));
   group.append(renderReportTable("Movimentações",movements,[{label:"Data/hora",value:r=>reportDate(r.createdAt)},{label:"Operação",value:r=>r.action},{label:"Produto",value:r=>r.productName},{label:"Quantidade",value:r=>r.quantity},{label:"Origem",value:r=>r.sourceSector},{label:"Destino",value:r=>r.destinationSector},{label:"Responsável",value:r=>r.userName}]));
   $("managementReportTables").appendChild(group);
  });
  $("managementReportStatus").textContent=companyId?"Relatório restrito à empresa selecionada.":"Relatório geral: cada empresa aparece em uma seção separada.";
 }catch(err){$("managementReportStatus").textContent=err.message;message(err.message,true);}
}
$("managementCompanySelect").addEventListener("change",()=>{selectedCompanyId=$("managementCompanySelect").value||"";if(selectedCompanyId)localStorage.setItem("stok_company_id",selectedCompanyId);else localStorage.removeItem("stok_company_id");});
$("managementReportRefresh").addEventListener("click",loadManagementReport);

async function loadReports(){
 try{
  $("reportStatus").textContent="Consultando dados autorizados...";
  const all=currentUser.role==="superadmin"&&($("reportAllCompanies").checked||!selectedCompanyId);
  const query=all?"":currentUser.role==="superadmin"&&selectedCompanyId?"?companyId="+encodeURIComponent(selectedCompanyId):"";
  const data=await api("/reports/overview"+query,{headers:all?{"X-Company-Id":""}:{}});
  ensureCompanyReportScope(data);latestReportData=data;
  const summary=$("reportSummary");summary.replaceChildren();
  const counts=[["Empresas",data.summary?.companies??data.companies?.length??0],["Usuários",data.summary?.users??data.users?.length??0],["Produtos",data.summary?.products??data.products?.length??0],["Movimentações",data.summary?.movements??data.movements?.length??0],["Prestações",data.accountEntries?.length||0],["Atividades",data.activities?.length||0]];
  counts.forEach(([label,value])=>{const card=document.createElement("div");card.className="report-kpi";const strong=document.createElement("strong");strong.textContent=value;const span=document.createElement("span");span.textContent=label;card.append(strong,span);summary.appendChild(card);});
  const tables=$("reportTables");tables.replaceChildren();
  const company={label:"Empresa",value:r=>r.companyName||"—"};
  tables.append(
   renderReportTable("Empresas",data.companies||[],[{label:"Empresa",value:r=>r.name},{label:"CNPJ",value:r=>r.cnpj},{label:"Cidade",value:r=>r.city},{label:"Situação",value:r=>r.active===false?"Inativa":"Ativa"}],{edit:editReportCompany,remove:deleteReportCompany}),
   renderReportTable("Usuários",data.users||[],[company,{label:"Nome",value:r=>r.name},{label:"E-mail",value:r=>r.email},{label:"Perfil",value:r=>r.role},{label:"Setor",value:r=>r.sector},{label:"Cadastro",value:r=>reportDate(r.createdAt)}],{edit:editReportUser,remove:deleteReportUser}),
   renderReportTable("Produtos e bens",data.products||[],[company,{label:"Produto",value:r=>r.name},{label:"Tipo",value:r=>r.category},{label:"Setor responsável",value:r=>r.responsibleSector},{label:"Setor cadastro",value:r=>r.createdSector},{label:"Cadastrado por",value:r=>r.createdByName},{label:"Quantidade",value:r=>r.quantity},{label:"Data cadastro",value:r=>reportDate(r.createdAt)}]),
   renderReportTable("Movimentações",data.movements||[],[company,{label:"Produto",value:r=>r.productName},{label:"Operação",value:r=>r.action},{label:"Quantidade",value:r=>r.quantity},{label:"Setor origem",value:r=>r.sourceSector},{label:"Setor destino",value:r=>r.destinationSector},{label:"Setor ação",value:r=>r.actionSector||r.sector},{label:"Solicitado por",value:r=>r.requestedByName},{label:"Movimentado por",value:r=>r.userName},{label:"Autorizado por",value:r=>r.authorizedByName},{label:"Data/hora",value:r=>reportDate(r.createdAt)}],{edit:editReportMovement,remove:deleteReportMovement}),
   renderReportTable("Entregas",data.deliveries||[],[company,{label:"Produto",value:r=>r.productName},{label:"Quantidade",value:r=>r.quantity},{label:"Origem",value:r=>r.sourceSector},{label:"Destino",value:r=>r.destinationSector},{label:"Responsável pelo registro",value:r=>r.userName},{label:"Data/hora",value:r=>reportDate(r.createdAt)}],{edit:editReportMovement,remove:deleteReportMovement}),
   renderReportTable("Prestação de contas",data.accountEntries||[],[company,{label:"Produto",value:r=>r.productName},{label:"Tipo",value:r=>r.action+" "+(r.destination||"")},{label:"Quantidade",value:r=>r.quantity},{label:"Origem",value:r=>r.sourceSector},{label:"Destino",value:r=>r.destinationSector},{label:"Responsável",value:r=>r.userName},{label:"Data/hora",value:r=>reportDate(r.createdAt)},{label:"Justificativa/detalhes",value:r=>r.details}],{edit:editReportMovement,remove:deleteReportMovement}),
   renderReportTable("Autorizações",data.authorizations||[],[company,{label:"Solicitação",value:r=>r.type},{label:"Produto",value:r=>r.productName},{label:"Solicitante",value:r=>r.requesterName},{label:"Setor",value:r=>r.requesterSector},{label:"Destino",value:r=>r.destinationSector},{label:"Status",value:r=>r.status},{label:"Decidido por",value:r=>r.decidedByName},{label:"Data",value:r=>reportDate(r.createdAt)}]),
   renderReportTable("Atividades",data.activities||[],[company,{label:"Atividade",value:r=>r.title},{label:"Situação",value:r=>r.status},{label:"Prioridade",value:r=>r.priority},{label:"Setor",value:r=>r.sector},{label:"Criada por",value:r=>r.createdByName},{label:"Responsáveis",value:r=>(r.assignedNames||[]).join(", ")},{label:"Prazo",value:r=>reportDate(r.dueDate)},{label:"Atualizada",value:r=>reportDate(r.updatedAt)}])
  );
  $("exportReports").disabled=false;$("printReports").disabled=false;
  $("reportStatus").textContent="Relatório gerado em "+reportDate(data.generatedAt)+". Escopo: "+data.scope+".";
 }catch(err){latestReportData=null;$("exportReports").disabled=true;$("printReports").disabled=true;$("reportStatus").textContent=err.message;message(err.message,true);}
}
function csvQuote(value){return '"'+String(value??"").replace(/"/g,'""')+'"';}
function exportReportsCsv(){
 if(!latestReportData)return;
 const sections=[["USUÁRIOS",latestReportData.users||[]],["PRODUTOS",latestReportData.products||[]],["MOVIMENTAÇÕES",latestReportData.movements||[]],["ENTREGAS",latestReportData.deliveries||[]],["PRESTAÇÃO DE CONTAS",latestReportData.accountEntries||[]],["AUTORIZAÇÕES",latestReportData.authorizations||[]],["ATIVIDADES",latestReportData.activities||[]]];
 const fields=["companyName","name","title","productName","action","type","status","priority","category","role","email","sector","sourceSector","destinationSector","actionSector","requesterName","requestedByName","userName","authorizedByName","createdByName","quantity","unit","details","createdAt","updatedAt","dueDate"];
 const lines=["SEÇÃO;"+fields.join(";")];
 sections.forEach(([name,rows])=>rows.forEach(row=>lines.push([name,...fields.map(k=>row[k] instanceof Date?row[k].toISOString():row[k]??"")].map(csvQuote).join(";"))));
 const blob=new Blob(["\uFEFF"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="relatorio_STOK_"+new Date().toISOString().slice(0,10)+".csv";a.click();URL.revokeObjectURL(url);
}
$("loadReports").addEventListener("click",loadReports);
$("exportReports").addEventListener("click",exportReportsCsv);
$("printReports").addEventListener("click",()=>window.print());
$("reportAllCompanies").addEventListener("change",()=>{latestReportData=null;$("reportStatus").textContent="Clique em Gerar relatório para atualizar o escopo.";});
