/* Fire Alarm Deficiency Manager - client application */
const $ = id => document.getElementById(id);
let sb=null, user=null, currentReport=null, deficiencies=[], members=[], channel=null;
const toast = msg => { const t=$("toast"); t.textContent=msg; t.style.display="block"; setTimeout(()=>t.style.display="none",3200); };
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uuidCode = () => Math.random().toString(36).slice(2,8).toUpperCase();
const show = (id,on=true)=>$(id).classList.toggle("hidden",!on);
function connectionFromSaved(){
  const url=localStorage.getItem("fad_supabase_url"), key=localStorage.getItem("fad_supabase_key");
  if(url&&key){$("supabaseUrl").value=url;$("supabaseKey").value=key;connect(url,key);}
}
async function connect(url,key){
  try{
    if(!url.startsWith("https://")||!key.trim()) throw Error("Enter a valid HTTPS project URL and public anon/publishable key.");
    localStorage.setItem("fad_supabase_url",url);localStorage.setItem("fad_supabase_key",key);
    sb=window.supabase.createClient(url,key);
    const {data:{session},error}=await sb.auth.getSession();if(error)throw error;
    show("setupPanel",false);show("authPanel",!session);show("workspace",!!session);show("logoutBtn",!!session);
    if(session){user=session.user;await startWorkspace();}
  }catch(e){toast(e.message||"Could not connect.");}
}
$("connectBtn").onclick=()=>connect($("supabaseUrl").value.trim(),$("supabaseKey").value.trim());
$("signinBtn").onclick=async()=>{try{const {error}=await sb.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error)throw error;const {data}=await sb.auth.getUser();user=data.user;show("authPanel",false);show("workspace",true);show("logoutBtn",true);await startWorkspace();}catch(e){toast(e.message)}};
$("signupBtn").onclick=async()=>{try{const {data,error}=await sb.auth.signUp({email:$("email").value.trim(),password:$("password").value});if(error)throw error;toast(data.session?"Account created.":"Check your email to confirm the account, then sign in.");}catch(e){toast(e.message)}};
$("logoutBtn").onclick=async()=>{if(sb)await sb.auth.signOut();user=null;currentReport=null;show("workspace",false);show("reportPanel",false);show("authPanel",true);show("logoutBtn",false);};
async function startWorkspace(){
  $("signedInAs").textContent=`Signed in as ${user.email}`;
  await loadReports();
  sb.auth.onAuthStateChange((_event,session)=>{if(!session){show("workspace",false);show("authPanel",true)}});
}
async function loadReports(){
  const {data,error}=await sb.from("reports").select("id,property_name,address,join_code,status,created_at").order("created_at",{ascending:false});
  if(error){toast(error.message);return}
  const list=$("reportsList");list.innerHTML="";
  if(!data.length){list.innerHTML='<p class="muted">No reports yet. Create a property report or join one with a code.</p>';return}
  data.forEach(r=>{const d=document.createElement("div");d.className="carditem";d.innerHTML=`<div class="topline"><div><h3>${esc(r.property_name)}</h3><div class="meta">${esc(r.address||"Address not entered")} · ${esc(r.status)}</div></div><button class="primary">Open</button></div>`;d.querySelector("button").onclick=()=>openReport(r.id);list.appendChild(d)});
}
$("createReportBtn").onclick=async()=>{
  const name=$("newProperty").value.trim();if(!name){toast("Enter a property/customer name.");return}
  try{
    const {data,error}=await sb.from("reports").insert({property_name:name,address:$("newAddress").value.trim(),join_code:uuidCode(),created_by:user.id}).select().single();
    if(error)throw error;await openReport(data.id);await loadReports();$("newProperty").value="";$("newAddress").value="";
  }catch(e){toast(e.message)}
};
$("joinBtn").onclick=async()=>{
  const code=$("joinCode").value.trim().toUpperCase();if(!code){toast("Enter a report join code.");return}
  const {data,error}=await sb.rpc("join_report_by_code",{p_code:code});
  if(error){toast(error.message);return}
  toast("Joined report.");$("joinCode").value="";await loadReports();if(data)await openReport(data);
};
$("backBtn").onclick=()=>{show("reportPanel",false);currentReport=null;if(channel){sb.removeChannel(channel);channel=null}loadReports()};
$("reportStatus").onchange=async()=>{if(!currentReport)return;const {error}=await sb.from("reports").update({status:$("reportStatus").value}).eq("id",currentReport.id);if(error)toast(error.message)};
async function openReport(id){
  if(channel){await sb.removeChannel(channel);channel=null}
  const {data:report,error}=await sb.from("reports").select("*").eq("id",id).single();if(error){toast(error.message);return}
  currentReport=report;show("reportPanel",true);$("reportTitle").textContent=report.property_name;$("reportAddress").textContent=report.address||"";
  $("reportCode").value=report.join_code;$("reportStatus").value=report.status;
  await Promise.all([loadDeficiencies(),loadMembers()]);
  channel=sb.channel("report-"+id).on("postgres_changes",{event:"*",schema:"public",table:"deficiencies",filter:`report_id=eq.${id}`},()=>loadDeficiencies())
    .on("postgres_changes",{event:"*",schema:"public",table:"report_members",filter:`report_id=eq.${id}`},()=>loadMembers())
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"reports",filter:`id=eq.${id}`},payload=>{$("reportStatus").value=payload.new.status})
    .subscribe(status=>{$("connectionStatus").textContent=status==="SUBSCRIBED"?"Live sync":"Connecting…"});
  $("scopeText").value="";
  window.scrollTo({top:0,behavior:"smooth"});
}
async function loadMembers(){
  if(!currentReport)return;const {data,error}=await sb.from("report_members").select("user_id,joined_at").eq("report_id",currentReport.id).order("joined_at");
  if(error){$("teamList").textContent=error.message;return}
  members=data||[];$("teamList").innerHTML=members.map((m,i)=>`<span class="pill">Technician ${i+1}${m.user_id===user.id?" (you)":""}</span>`).join("")||"No team members";
  $("teamList").innerHTML+=`<div class="muted">Share join code <b>${esc(currentReport.join_code)}</b> with up to ${Math.max(0,3-members.length)} additional technician(s).</div>`;
}
async function loadDeficiencies(){
  if(!currentReport)return;const {data,error}=await sb.from("deficiencies").select("*").eq("report_id",currentReport.id).order("created_at");
  if(error){toast(error.message);return}deficiencies=data||[];renderDeficiencies();
}
function renderDeficiencies(){
  $("deficiencyCount").textContent=`${deficiencies.length} entries`;
  $("deficienciesList").innerHTML="";
  if(!deficiencies.length)$("deficienciesList").textContent="No deficiencies entered yet.";
  deficiencies.forEach((x,i)=>{
    const d=document.createElement("div");d.className="carditem";
    d.innerHTML=`<div class="topline"><h3>${i+1}. ${esc(x.device_type)}</h3><button class="danger no-print">Delete</button></div>
    <div class="meta"><b>Floor:</b> ${esc(x.floor)} · <b>Location:</b> ${esc(x.location)}<br><b>Part:</b> ${esc(x.part_number)} · <b>Qty:</b> ${x.quantity}<br><b>Condition/action:</b> ${esc(x.description||"Not specified")}<br><b>Labor:</b> ${((x.quantity*x.minutes_each+x.extra_minutes)/60).toFixed(2)} hrs</div><div class="photo-list muted">Loading photos…</div>`;
    d.querySelector("button").onclick=async()=>{if(!confirm("Delete this deficiency?"))return;const {error}=await sb.from("deficiencies").delete().eq("id",x.id);if(error)toast(error.message);else await loadDeficiencies()};
    $("deficienciesList").appendChild(d);loadPhotosForEntry(x,d.querySelector(".photo-list"));
  });
  const mins=deficiencies.reduce((a,x)=>a+x.quantity*x.minutes_each+x.extra_minutes,0);
  $("laborTotal").textContent=(mins/60).toFixed(2)+" hrs";$("deviceTotal").textContent=deficiencies.reduce((a,x)=>a+x.quantity,0);
}
async function loadPhotosForEntry(x,el){
  const {data,error}=await sb.from("deficiency_photos").select("storage_path").eq("deficiency_id",x.id);
  if(error){el.textContent="Photo list unavailable";return}el.innerHTML="";
  for(const p of data||[]){const {data:signed}=await sb.storage.from("deficiency-photos").createSignedUrl(p.storage_path,1800);if(signed?.signedUrl){const img=document.createElement("img");img.className="photo";img.src=signed.signedUrl;img.alt="Deficiency photograph";el.appendChild(img)}}
  if(!el.children.length)el.textContent="No photos attached";
}
$("addDeficiencyBtn").onclick=async()=>{
  if(!currentReport)return;
  const quantity=Number($("quantity").value),each=Number($("minutesEach").value),extra=Number($("extraMinutes").value);
  const floor=$("floor").value.trim(),location=$("location").value.trim(),part=$("partNumber").value.trim();
  if(!floor||!location||!part||!Number.isInteger(quantity)||quantity<1||!Number.isFinite(each)||each<0||!Number.isFinite(extra)||extra<0){toast("Enter floor, location, part number, valid quantity and labor minutes.");return}
  const row={report_id:currentReport.id,device_type:$("deviceType").value,floor,location,part_number:part,quantity,minutes_each:each,extra_minutes:extra,description:$("description").value.trim(),created_by:user.id};
  const {data,error}=await sb.from("deficiencies").insert(row).select().single();if(error){toast(error.message);return}
  const selected=[...($("photos").files||[])];
  for(const file of selected){
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_"),path=`${currentReport.id}/${data.id}/${crypto.randomUUID()}-${safe}`;
    const up=await sb.storage.from("deficiency-photos").upload(path,file,{contentType:file.type||"image/jpeg"});
    if(up.error){toast("Deficiency saved, but a photo failed: "+up.error.message);continue}
    const ins=await sb.from("deficiency_photos").insert({report_id:currentReport.id,deficiency_id:data.id,storage_path:path,uploaded_by:user.id});
    if(ins.error)toast("Photo uploaded but its record failed: "+ins.error.message);
  }
  ["location","partNumber","description"].forEach(id=>$(id).value="");$("quantity").value="1";$("photos").value="";
  toast("Deficiency saved.");await loadDeficiencies();
};
$("draftScopeBtn").onclick=()=>{
  if(!deficiencies.length){toast("Add deficiencies first.");return}
  const lines=deficiencies.map((x,i)=>`${i+1}. Furnish and replace ${x.quantity} ${x.device_type}(s), part ${x.part_number}, located on ${x.floor} at ${x.location}. ${x.description||""} Verify operation and document testing after replacement.`);
  $("scopeText").value=`Recommended scope of work for ${currentReport.property_name}:\n\n${lines.join("\n\n")}\n\nInclude applicable system testing, restoration, and documentation in accordance with the approved project requirements and applicable codes. Coordinate any required impairment notifications, permits, and AHJ acceptance activities with the responsible parties.`;
};
async function imageToData(url){
  return new Promise(resolve=>{const im=new Image();im.crossOrigin="anonymous";im.onload=()=>{const c=document.createElement("canvas");c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext("2d").drawImage(im,0,0);resolve(c.toDataURL("image/jpeg",.78))};im.onerror=()=>resolve(null);im.src=url});
}
$("pdfBtn").onclick=async()=>{
  if(!currentReport){return}if(!window.jspdf?.jsPDF){toast("PDF library did not load. Check internet connection.");return}
  const {jsPDF}=window.jspdf,doc=new jsPDF({unit:"pt",format:"letter"});let y=48;
  const page=()=>{doc.addPage();y=48},check=(h)=>{if(y+h>740)page()},line=(s,size=10,bold=false)=>{doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);const arr=doc.splitTextToSize(String(s),510);check(arr.length*14+5);doc.text(arr,48,y);y+=arr.length*14+5};
  doc.setFont("helvetica","bold");doc.setFontSize(18);doc.text("FIRE ALARM DEFICIENCY REPORT",48,y);y+=25;
  line(`Property: ${currentReport.property_name}`,11,true);line(`Address: ${currentReport.address||"Not provided"}`);line(`Generated: ${new Date().toLocaleString()}`);line(`Status: ${$("reportStatus").value}`);line(`Technicians assigned: ${members.length} (maximum 3)`);y+=8;
  line("DEFICIENCIES",13,true);
  for(let i=0;i<deficiencies.length;i++){
    const x=deficiencies[i];check(105);line(`${i+1}. ${x.device_type}`,11,true);
    line(`Floor: ${x.floor} | Location: ${x.location}`);line(`Part number: ${x.part_number} | Quantity: ${x.quantity}`);
    line(`Condition / recommended action: ${x.description||"Not specified"}`);
    line(`Estimated labor: ${((x.quantity*x.minutes_each+x.extra_minutes)/60).toFixed(2)} hours`);
    const {data:photos}=await sb.from("deficiency_photos").select("storage_path").eq("deficiency_id",x.id);
    for(const p of photos||[]){const {data:signed}=await sb.storage.from("deficiency-photos").createSignedUrl(p.storage_path,300);if(signed?.signedUrl){const image=await imageToData(signed.signedUrl);if(image){check(145);doc.addImage(image,"JPEG",48,y,120,90);y+=98}}}
    y+=8;
  }
  const total=deficiencies.reduce((a,x)=>a+x.quantity*x.minutes_each+x.extra_minutes,0);
  y+=4;line(`TOTAL DEVICES: ${deficiencies.reduce((a,x)=>a+x.quantity,0)}`,11,true);line(`TOTAL ESTIMATED LABOR: ${(total/60).toFixed(2)} hours`,11,true);
  y+=8;line("SCOPE OF WORK",13,true);line($("scopeText").value||"Scope of work not entered.");
  y+=12;line("Closeout note: Confirm all work performed, device testing, system restoration, monitoring communication, and required acceptance documentation before representing the system as returned to service.",9);
  doc.save(`Fire-Alarm-Deficiency-${currentReport.property_name.replace(/[^a-z0-9]/gi,"-")}.pdf`);
};
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
connectionFromSaved();