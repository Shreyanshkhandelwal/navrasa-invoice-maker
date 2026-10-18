import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, LayoutDashboard, Users, Settings, Plus, Search, Download, CloudUpload, Eye, Trash2, CheckCircle2, Clock3, IndianRupee, ArrowUpRight, ChevronDown, X, RefreshCw, CircleAlert, Save } from 'lucide-react';

type Item = { id: number; description: string; sac: string; qty: number; rate: number; gst: number };
type Client = { id: string; name: string; address: string; gstin?: string | null; phone?: string | null; email?: string | null };
type Invoice = {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate?: string | null;
  clientName: string;
  clientAddress: string;
  clientGstin?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  placeOfSupply?: string;
  taxMode?: 'IGST' | 'SPLIT';
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amountPaid: number;
  paymentStatus: string;
  workStatus?: string;
  workProgress?: number;
  status: string;
  notes?: string | null;
  items: Item[];
  driveWebViewLink?: string | null;
};
type Dashboard = { totalInvoiced: number; totalPaid: number; outstanding: number; overdueAmount: number; invoiceCount: number; paidCount: number; pendingCount: number; overdueCount: number; recentInvoices: Invoice[] };
const API = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const AUTH_TOKEN_KEY = 'navrasa_invoice_token';
const AUTH_USER_KEY = 'navrasa_invoice_user';
type AuthResponse = { token: string; user: { id: string; email: string }; business: { id: string; name: string } };
const money = (n:number) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n || 0);
const dateLabel = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const today = () => new Date().toISOString().slice(0,10);
const blankClient = { name:'', address:'', gstin:'', phone:'', email:'' };
const blankItem = (): Item => ({ id: Date.now(), description:'', sac:'', qty:1, rate:0, gst:18 });
const amountWords = (amount:number) => {
 const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
 const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
 const under=(n:number):string => n<20?ones[n]:n<100?tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:''):ones[Math.floor(n/100)]+' Hundred'+(n%100?' '+under(n%100):'');
 const n=Math.round(amount); if(!n)return 'Zero Rupees Only'; let x=n,out='';
 for(const [v,label] of [[10000000,'Crore'],[100000,'Lakh'],[1000,'Thousand']] as [number,string][]){if(x>=v){out+=under(Math.floor(x/v))+' '+label+' ';x%=v;}}
 if(x)out+=under(x)+' '; return 'Rupees '+out.trim()+' Only';
};
async function api<T>(path:string, init?:RequestInit):Promise<T>{
 const token = localStorage.getItem(AUTH_TOKEN_KEY);
 const headers = new Headers(init?.headers);
 if (!headers.has('Content-Type') && init?.body) headers.set('Content-Type','application/json');
 if (token) headers.set('Authorization', `Bearer ${token}`);
 const response = await fetch(`${API}${path}`, { ...init, headers });
 if(response.status === 401 && !path.startsWith('/api/auth/')) {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  window.dispatchEvent(new Event('navrasa-auth-expired'));
 }
 if(!response.ok){let message=`Request failed (${response.status})`;try{const body=await response.json();message=body.error||message;}catch{}throw new Error(message);}
 if(response.status===204) return undefined as T;
 return response.json() as Promise<T>;
}
export default function App(){
 const [authToken,setAuthToken]=useState<string|null>(()=>localStorage.getItem(AUTH_TOKEN_KEY));
 const [authUser,setAuthUser]=useState<{id:string;email:string;businessName:string}|null>(()=>{try{return JSON.parse(localStorage.getItem(AUTH_USER_KEY)||'null');}catch{return null;}});
 const [page,setPage]=useState<'dashboard'|'invoices'|'create'|'clients'>('dashboard');
 const [dashboard,setDashboard]=useState<Dashboard|null>(null);
 const [invoices,setInvoices]=useState<Invoice[]>([]);
 const [clients,setClients]=useState<Client[]>([]);
 const [items,setItems]=useState<Item[]>([blankItem()]);
 const [client,setClient]=useState({...blankClient});
 const [invoiceNo,setInvoiceNo]=useState('');
 const [date,setDate]=useState(today());
 const [dueDate,setDueDate]=useState('');
 const [place,setPlace]=useState('');
 const [taxMode,setTaxMode]=useState<'IGST'|'SPLIT'>('IGST');
 const [discount,setDiscount]=useState(0);
 const [amountPaid,setAmountPaid]=useState(0);
 const [editingInvoiceId,setEditingInvoiceId]=useState<string|null>(null);
 const [workStatus,setWorkStatus]=useState<'PENDING'|'PARTIAL'|'COMPLETED'>('PENDING');
 const [search,setSearch]=useState('');
 const [clientSearch,setClientSearch]=useState('');
 const [toast,setToast]=useState('');
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const [showPreview,setShowPreview]=useState(true);
 const [clientForm,setClientForm]=useState({...blankClient});
 const [editingClient,setEditingClient]=useState<string|null>(null);
 const [savingClient,setSavingClient]=useState(false);
 const [authMode,setAuthMode]=useState<'login'|'register'>('login');
 const [authBusinessName,setAuthBusinessName]=useState('');
 const [authEmail,setAuthEmail]=useState('');
 const [authPassword,setAuthPassword]=useState('');
 const [authBusy,setAuthBusy]=useState(false);
 const [authError,setAuthError]=useState('');
 const subtotal=useMemo(()=>items.reduce((s,i)=>s+Math.max(0,i.qty)*Math.max(0,i.rate),0),[items]);
 const tax=useMemo(()=>items.reduce((s,i)=>s+Math.max(0,i.qty)*Math.max(0,i.rate)*Math.max(0,i.gst)/100,0),[items]);
 const total=Math.max(0,subtotal+tax-discount);
 const notify=(s:string)=>{setToast(s);window.setTimeout(()=>setToast(''),3500)};
 const loadDashboard=useCallback(async()=>{try{setDashboard(await api<Dashboard>('/api/dashboard'));}catch(e){setError(e instanceof Error?e.message:'Could not load dashboard');}},[]);
 const loadInvoices=useCallback(async()=>{try{setInvoices(await api<Invoice[]>(`/api/invoices?q=${encodeURIComponent(search)}`));}catch(e){setError(e instanceof Error?e.message:'Could not load invoices');}},[search]);
 const loadClients=useCallback(async()=>{try{setClients(await api<Client[]>(`/api/clients?q=${encodeURIComponent(clientSearch)}`));}catch(e){setError(e instanceof Error?e.message:'Could not load clients');}},[clientSearch]);
 const refreshAll=useCallback(async()=>{if(!localStorage.getItem(AUTH_TOKEN_KEY))return;setLoading(true);setError('');await Promise.all([loadDashboard(),loadInvoices(),loadClients()]);setLoading(false);},[loadDashboard,loadInvoices,loadClients]);
 useEffect(()=>{if(authToken)void refreshAll();},[authToken,refreshAll]);
 useEffect(()=>{const expire=()=>{setAuthToken(null);setAuthUser(null);setDashboard(null);setInvoices([]);setClients([]);};window.addEventListener('navrasa-auth-expired',expire);return()=>window.removeEventListener('navrasa-auth-expired',expire);},[]);
 async function submitAuth(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setAuthBusy(true);setAuthError('');try{const result=await api<AuthResponse>(authMode==='register'?'/api/auth/register':'/api/auth/login',{method:'POST',body:JSON.stringify({email:authEmail,password:authPassword,...(authMode==='register'?{businessName:authBusinessName}:{})})});localStorage.setItem(AUTH_TOKEN_KEY,result.token);const savedUser={id:result.user.id,email:result.user.email,businessName:result.business.name};localStorage.setItem(AUTH_USER_KEY,JSON.stringify(savedUser));setAuthUser(savedUser);setAuthToken(result.token);setAuthPassword('');}catch(e){setAuthError(e instanceof Error?e.message:'Authentication failed.');}finally{setAuthBusy(false);}}
 function logout(){localStorage.removeItem(AUTH_TOKEN_KEY);localStorage.removeItem(AUTH_USER_KEY);setAuthToken(null);setAuthUser(null);setDashboard(null);setInvoices([]);setClients([]);setPage('dashboard');}
 useEffect(()=>{if(authToken&&page==='clients')void loadClients();},[authToken,page,loadClients]);
 useEffect(()=>{if(authToken&&(page==='invoices'||page==='dashboard'))void loadInvoices();},[authToken,page,loadInvoices]);
 const updateItem=(id:number,key:keyof Item,value:string|number)=>setItems(old=>old.map(i=>i.id===id?{...i,[key]:value}:i));
 const newInvoice=()=>{setEditingInvoiceId(null);setWorkStatus('PENDING');setInvoiceNo('');setDate(today());setDueDate('');setPlace('');setTaxMode('IGST');setDiscount(0);setAmountPaid(0);setClient({...blankClient});setItems([blankItem()]);setPage('create');setError('');};
 function editInvoice(inv:Invoice){
  setEditingInvoiceId(inv.id);setInvoiceNo(inv.invoiceNo);setDate(inv.invoiceDate?inv.invoiceDate.slice(0,10):today());setDueDate(inv.dueDate?inv.dueDate.slice(0,10):'');setPlace(inv.placeOfSupply||'');setTaxMode(inv.taxMode==='SPLIT'?'SPLIT':'IGST');setDiscount(Number(inv.discount)||0);setAmountPaid(Number(inv.amountPaid)||0);
  setWorkStatus(inv.workStatus==='COMPLETED'?'COMPLETED':inv.workStatus==='PARTIAL'?'PARTIAL':'PENDING');
  setClient({name:inv.clientName||'',address:inv.clientAddress||'',gstin:inv.clientGstin||'',phone:inv.clientPhone||'',email:inv.clientEmail||''});
  const savedItems=Array.isArray(inv.items)?inv.items:[];
  setItems(savedItems.length?savedItems.map((item,index)=>({...item,id:Date.now()+index,qty:Number(item.qty)||0,rate:Number(item.rate)||0,gst:Number(item.gst)||0})):[blankItem()]);
  setError('');setPage('create');
 }
 const chooseClient=(id:string)=>{const c=clients.find(x=>x.id===id);if(c)setClient({name:c.name,address:c.address||'',gstin:c.gstin||'',phone:c.phone||'',email:c.email||''});};
 const payload=()=>({invoiceNo:invoiceNo.trim(),date,dueDate,place,taxMode,discount,amountPaid,workStatus,client,items,subtotal,tax,total,amountWords:amountWords(total)});
 async function saveInvoice(){
  if(!invoiceNo.trim()||!client.name.trim()||!items.length||items.some(i=>!i.description.trim()||!Number.isFinite(i.qty)||i.qty<=0||!Number.isFinite(i.rate)||i.rate<0)){notify('Enter an invoice number, client name and valid line items.');return;}
  if(amountPaid<0||amountPaid>total){notify('Amount paid must be between ₹0 and the invoice total.');return;}
  setLoading(true);setError('');try{const isEditing=Boolean(editingInvoiceId);await api<Invoice>(isEditing?`/api/invoices/${editingInvoiceId}`:'/api/invoices',{method:isEditing?'PUT':'POST',body:JSON.stringify(payload())});await refreshAll();notify(isEditing?'Invoice updated successfully.':'Invoice saved to PostgreSQL.');setEditingInvoiceId(null);setPage('invoices');}catch(e){notify(e instanceof Error?e.message:'Could not save invoice');}finally{setLoading(false);}
 }
 async function downloadInvoice(){
  if(editingInvoiceId){notify('Save your invoice changes first, then generate the PDF.');return;}
  if(!invoiceNo.trim()||!client.name.trim()||!items.length||items.some(i=>!i.description.trim()||i.qty<=0||i.rate<0)){notify('Enter a unique invoice number, client name and valid line items.');return;}
  try{setLoading(true);const res=await fetch(`${API}/api/invoices/pdf`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)||''}`},body:JSON.stringify(payload())});if(!res.ok){let m='Could not generate PDF';try{m=(await res.json()).error||m;}catch{}throw new Error(m);}const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${invoiceNo.replace(/[^a-zA-Z0-9_-]/g,'-')}.pdf`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);await refreshAll();notify('PDF generated and invoice stored.');setPage('invoices');}catch(e){notify(e instanceof Error?e.message:'Could not generate PDF');}finally{setLoading(false);}
 }
 async function updatePayment(inv:Invoice){const input=window.prompt(`Total invoice: ${money(inv.total)}\nAmount already paid: ${money(inv.amountPaid)}\nEnter the total amount received so far:`,String(inv.amountPaid));if(input===null)return;try{await api(`/api/invoices/${inv.id}/payment`,{method:'PATCH',body:JSON.stringify({amountPaid:Number(input)})});await refreshAll();notify('Payment record updated.');}catch(e){notify(e instanceof Error?e.message:'Could not update payment');}}
 async function updateWorkStatus(inv:Invoice,nextStatus:string){
  let workProgress = Number(inv.workProgress ?? (inv.workStatus === 'COMPLETED' ? 100 : 0));
  let amountPaid = Number(inv.amountPaid || 0);
  if(nextStatus === 'PARTIAL'){
   const progressInput = window.prompt('How much of the work is completed? Enter a percentage from 1 to 99.', String(workProgress > 0 && workProgress < 100 ? workProgress : 50));
   if(progressInput === null){await refreshAll();return;}
   workProgress = Number(progressInput);
   if(!Number.isInteger(workProgress) || workProgress < 1 || workProgress > 99){notify('Work completion must be a whole percentage from 1 to 99.');await refreshAll();return;}
   const paymentInput = window.prompt(`Invoice total: ${money(inv.total)}\nPayment received so far: ${money(inv.amountPaid)}\nEnter the TOTAL payment received so far in rupees.`, String(amountPaid));
   if(paymentInput === null){await refreshAll();return;}
   amountPaid = Number(paymentInput);
   if(!Number.isFinite(amountPaid) || amountPaid < 0 || amountPaid > Number(inv.total)){notify('Payment received must be between ₹0 and the invoice total.');await refreshAll();return;}
  } else if(nextStatus === 'COMPLETED'){
   workProgress = 100;
   amountPaid = Number(inv.total);
  } else {
   workProgress = 0;
  }
  try{
   await api(`/api/invoices/${inv.id}/work-status`,{method:'PATCH',body:JSON.stringify({workStatus:nextStatus,workProgress,...(nextStatus === 'PARTIAL' || nextStatus === 'COMPLETED' ? {amountPaid} : {})})});
   await refreshAll();notify('Work and payment status updated.');
  }catch(e){notify(e instanceof Error?e.message:'Could not update work status');await refreshAll();}
 }
 async function saveClient(){if(!clientForm.name.trim()){notify('Client name is required.');return;}setSavingClient(true);try{if(editingClient)await api(`/api/clients/${editingClient}`,{method:'PUT',body:JSON.stringify(clientForm)});else await api('/api/clients',{method:'POST',body:JSON.stringify(clientForm)});setClientForm({...blankClient});setEditingClient(null);await loadClients();notify('Client saved to PostgreSQL.');}catch(e){notify(e instanceof Error?e.message:'Could not save client');}finally{setSavingClient(false);}}
 async function deleteClient(c:Client){if(!window.confirm(`Delete ${c.name} from the client directory? Existing invoices are not changed.`))return;try{await api(`/api/clients/${c.id}`,{method:'DELETE'});await loadClients();notify('Client deleted.');}catch(e){notify(e instanceof Error?e.message:'Could not delete client');}}
 const nav=(p:'dashboard'|'invoices'|'create'|'clients')=>{setError('');setPage(p);};
 const statusClass=(s:string)=>(s||'pending').toLowerCase().replaceAll(' ','-');
 if(!authToken){return <AuthScreen mode={authMode} setMode={setAuthMode} businessName={authBusinessName} setBusinessName={setAuthBusinessName} email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} busy={authBusy} error={authError} onSubmit={submitAuth}/>;}
 return <div className="app-shell">
  <aside className="sidebar"><div className="brand"><img
  src="/navrasa-logo.png"
  alt="NavRasa"
  className="brand-logo"
/><div><strong>NAVRASA</strong><span>INVOICE STUDIO</span></div></div><div className="workspace"><span className="workspace-dot"/> {authUser?.businessName || 'Your business'} <ChevronDown size={15}/></div><div className="nav-label">WORKSPACE</div>
   <button className={`nav-item ${page==='dashboard'?'active':''}`} onClick={()=>nav('dashboard')}><LayoutDashboard size={18}/> Overview</button>
   <button className={`nav-item ${page==='invoices'||page==='create'?'active':''}`} onClick={()=>nav('invoices')}><FileText size={18}/> Invoices <span className="nav-count">{dashboard?.invoiceCount ?? '—'}</span></button>
   <button className={`nav-item ${page==='clients'?'active':''}`} onClick={()=>nav('clients')}><Users size={18}/> Clients <span className="nav-count">{clients.length}</span></button><div className="nav-label">PREFERENCES</div><button className="nav-item" onClick={()=>notify('Company profile is based on the supplied invoice; edit verified business details in server/src/index.ts before issuing live invoices.')}><Settings size={18}/> Company profile</button>
   <div className="sidebar-bottom"><div className="help-card"><div className="help-icon">✦</div><strong>Live database</strong><p>Invoices and clients are loaded from your PostgreSQL database.</p><button onClick={()=>void refreshAll()}>Refresh data <RefreshCw size={14}/></button></div><div className="user-profile"><div className="avatar">{(authUser?.businessName||'B').slice(0,2).toUpperCase()}</div><div><strong>{authUser?.email || 'Signed in'}</strong><span>{authUser?.businessName || 'Business workspace'}</span></div><button className="text-btn" onClick={logout}>Log out</button></div></div>
  </aside>
  <main className="main-area"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>{page==='create'?'New invoice':page==='clients'?'Clients':page==='invoices'?'Invoices':'Overview'}</b></div><div className="top-actions"><div className="status-pill"><span/> {loading?'Syncing database':'Database connected'}</div><button className="icon-btn" title="Refresh" onClick={()=>void refreshAll()}><RefreshCw size={18}/></button><div className="avatar small">NR</div></div></header>
   {error&&<div className="error-banner"><CircleAlert size={17}/><span>{error} — confirm the API is running at {API}.</span><button onClick={()=>setError('')}><X size={15}/></button></div>}
   {page==='dashboard'&&<section className="page-content"><div className="page-heading"><div><div className="eyebrow">LIVE DATABASE SUMMARY</div><h1>Invoice overview <span>✦</span></h1><p>Figures below are calculated from records saved in PostgreSQL.</p></div><button className="primary-btn" onClick={newInvoice}><Plus size={18}/> Create invoice</button></div>
    <div className="stats-grid"><Stat icon={<IndianRupee/>} label="Total invoiced" value={money(dashboard?.totalInvoiced||0)} note={`${dashboard?.invoiceCount||0} saved invoices`} /><Stat icon={<CheckCircle2/>} label="Payments received" value={money(dashboard?.totalPaid||0)} note={`${dashboard?.paidCount||0} fully paid invoices`}/><Stat icon={<Clock3/>} label="Outstanding" value={money(dashboard?.outstanding||0)} note={`${dashboard?.pendingCount||0} awaiting payment`}/><Stat icon={<FileText/>} label="Overdue balance" value={money(dashboard?.overdueAmount||0)} note={`${dashboard?.overdueCount||0} overdue invoices`} warning={Boolean(dashboard?.overdueCount)}/></div>
    <div className="content-card invoice-list-card"><div className="card-heading"><div><h2>Recent invoices</h2><p>Latest records from your database.</p></div><button className="text-btn" onClick={()=>nav('invoices')}>View all invoices <ArrowUpRight size={15}/></button></div><div className="table-tools"><div className="searchbox"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search invoice number or client..."/></div><button className="filter-btn" onClick={()=>void refreshAll()}><RefreshCw size={14}/> Refresh</button></div><InvoiceTable invoices={invoices.slice(0,6)} onPayment={updatePayment} onEdit={editInvoice} onWorkStatus={updateWorkStatus} empty="No invoices have been saved yet. Create an invoice to see real records here."/></div>
    <div className="bottom-grid"><div className="content-card drive-card"><div className="drive-logo"><CloudUpload size={22}/></div><div className="drive-copy"><h3>Google Drive sync</h3><p>Connect Google Drive to store generated invoice PDFs in your company account.</p><button className="secondary-btn" onClick={()=>window.open(`${API}/api/google/connect`,'_blank','noopener,noreferrer')}>Connect Google Drive <ArrowUpRight size={15}/></button></div><span className="not-connected">Check setup</span></div><div className="content-card tip-card"><div className="tip-symbol">✦</div><div><h3>No demo figures</h3><p>Summary totals update when invoices and payments are saved. A new database starts at zero until real records are entered.</p></div></div></div>
   </section>}
   {page==='invoices'&&<section className="page-content"><div className="page-heading"><div><div className="eyebrow">DATABASE RECORDS</div><h1>Invoices</h1><p>Create invoices, generate PDFs and update payment records.</p></div><button className="primary-btn" onClick={newInvoice}><Plus size={18}/> Create invoice</button></div><div className="content-card invoice-list-card"><div className="table-tools"><div className="searchbox"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search invoice number or client..."/></div><button className="filter-btn" onClick={()=>void loadInvoices()}><RefreshCw size={14}/> Refresh</button></div><InvoiceTable invoices={invoices} onPayment={updatePayment} onEdit={editInvoice} onWorkStatus={updateWorkStatus} empty="No invoices found. Use Create invoice to add the first genuine record."/></div></section>}
   {page==='clients'&&<section className="page-content"><div className="page-heading"><div><div className="eyebrow">SAVED CONTACTS</div><h1>Clients</h1><p>Client details are saved to PostgreSQL and can be reused on invoices.</p></div></div><div className="content-card form-card client-admin"><div className="section-title"><span className="step-number">{editingClient?'EDIT':'NEW'}</span><div><h2>{editingClient?'Edit client':'Add a client'}</h2><p>Only enter details supplied or verified by the client.</p></div></div><div className="field-grid"><Field label="Legal entity name"><input value={clientForm.name} onChange={e=>setClientForm({...clientForm,name:e.target.value})} placeholder="Registered company name"/></Field><Field label="GSTIN"><input value={clientForm.gstin||''} onChange={e=>setClientForm({...clientForm,gstin:e.target.value})} placeholder="Optional"/></Field><Field label="Phone"><input value={clientForm.phone||''} onChange={e=>setClientForm({...clientForm,phone:e.target.value})} placeholder="Contact number"/></Field><Field label="Email"><input type="email" value={clientForm.email||''} onChange={e=>setClientForm({...clientForm,email:e.target.value})} placeholder="Billing email"/></Field></div><Field label="Billing address"><textarea rows={2} value={clientForm.address} onChange={e=>setClientForm({...clientForm,address:e.target.value})} placeholder="Registered billing address"/></Field><div className="inline-actions"><button className="primary-btn" disabled={savingClient} onClick={()=>void saveClient()}><Save size={16}/>{savingClient?'Saving...':editingClient?'Update client':'Save client'}</button>{editingClient&&<button className="secondary-btn" onClick={()=>{setEditingClient(null);setClientForm({...blankClient});}}>Cancel</button>}</div></div><div className="content-card invoice-list-card"><div className="card-heading"><div><h2>Client directory</h2><p>{clients.length} saved clients</p></div></div><div className="table-tools"><div className="searchbox"><Search size={17}/><input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder="Search clients..."/></div></div><div className="table-wrap"><table><thead><tr><th>CLIENT</th><th>GSTIN</th><th>PHONE</th><th>EMAIL</th><th></th></tr></thead><tbody>{clients.map(c=><tr key={c.id}><td><strong>{c.name}</strong><div className="muted-cell">{c.address||'No billing address saved'}</div></td><td>{c.gstin||'—'}</td><td>{c.phone||'—'}</td><td>{c.email||'—'}</td><td><button className="row-action" title="Edit" onClick={()=>{setEditingClient(c.id);setClientForm({name:c.name,address:c.address||'',gstin:c.gstin||'',phone:c.phone||'',email:c.email||''});}}><Eye size={16}/></button><button className="row-action danger-action" title="Delete" onClick={()=>void deleteClient(c)}><Trash2 size={16}/></button></td></tr>)}</tbody></table>{clients.length===0&&<div className="empty-state"><Users size={28}/><h2>No saved clients</h2><p>Save a client here or create an invoice; client details entered on invoices are also stored.</p></div>}</div></div></section>}
   {page==='create'&&<section className="builder-page"><div className="builder-heading"><div><button className="back-link" onClick={()=>nav('invoices')}>← Back to invoices</button><h1>{editingInvoiceId?'Edit invoice':'Create invoice'}</h1><p>Enter verified billing details. Invoice numbers must be unique and follow your company’s numbering policy.</p></div><div className="builder-actions"><button className="secondary-btn" onClick={()=>setShowPreview(v=>!v)}><Eye size={16}/>{showPreview?'Hide preview':'Show preview'}</button><button className="secondary-btn" disabled={loading} onClick={()=>void saveInvoice()}><Save size={16}/> {editingInvoiceId?'Save changes':'Save invoice'}</button><button className="primary-btn" disabled={loading||Boolean(editingInvoiceId)} onClick={()=>void downloadInvoice()}><Download size={17}/>{loading?'Working...':'Save & generate PDF'}</button></div></div>
    <div className={`builder-grid ${showPreview?'':'no-preview'}`}><div className="editor-column"><div className="form-card"><div className="section-title"><span className="step-number">01</span><div><h2>Invoice details</h2><p>Enter the actual invoice number and dates.</p></div></div><div className="field-grid"><Field label="Invoice number *"><input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="e.g. 17/26-27"/></Field><Field label="Invoice date"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label="Due date"><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></Field><Field label="Place of supply"><input value={place} onChange={e=>setPlace(e.target.value)} placeholder="e.g. Rajasthan (08)"/></Field></div></div>
     <div className="form-card"><div className="section-title"><span className="step-number">02</span><div><h2>Client information</h2><p>Choose a saved client or enter their verified details.</p></div></div><Field label="Use saved client"><select defaultValue="" onChange={e=>chooseClient(e.target.value)}><option value="">Enter a new client / choose saved client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.gstin?` · ${c.gstin}`:''}</option>)}</select></Field><Field label="Client / legal entity name *"><input value={client.name} onChange={e=>setClient({...client,name:e.target.value})} placeholder="Registered legal name"/></Field><Field label="Billing address"><textarea rows={2} value={client.address} onChange={e=>setClient({...client,address:e.target.value})} placeholder="Billing address"/></Field><div className="field-grid"><Field label="GSTIN"><input value={client.gstin||''} onChange={e=>setClient({...client,gstin:e.target.value})} placeholder="Optional"/></Field><Field label="Contact number"><input value={client.phone||''} onChange={e=>setClient({...client,phone:e.target.value})} placeholder="Optional"/></Field></div><Field label="Billing email"><input type="email" value={client.email||''} onChange={e=>setClient({...client,email:e.target.value})} placeholder="Optional"/></Field></div>
     <div className="form-card"><div className="section-title"><span className="step-number">03</span><div><h2>Items & services</h2><p>Enter the actual contracted services, quantities and rates.</p></div></div><div className="items-editor">{items.map((item,idx)=><div className="item-edit" key={item.id}><div className="item-edit-top"><span>ITEM {String(idx+1).padStart(2,'0')}</span><button className="delete-btn" onClick={()=>setItems(old=>old.filter(i=>i.id!==item.id))} title="Remove item"><Trash2 size={15}/></button></div><Field label="Description *"><input value={item.description} onChange={e=>updateItem(item.id,'description',e.target.value)} placeholder="Description of service or product"/></Field><div className="field-grid three"><Field label="SAC / HSN code"><input value={item.sac} onChange={e=>updateItem(item.id,'sac',e.target.value)} placeholder="If applicable"/></Field><Field label="Quantity"><input type="number" min="0.01" step="any" value={item.qty} onChange={e=>updateItem(item.id,'qty',Number(e.target.value))}/></Field><Field label="Rate (₹)"><input type="number" min="0" step="0.01" value={item.rate} onChange={e=>updateItem(item.id,'rate',Number(e.target.value))}/></Field></div><div className="item-bottom"><label>GST rate <select value={item.gst} onChange={e=>updateItem(item.id,'gst',Number(e.target.value))}><option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option></select></label><strong>{money(item.qty*item.rate)}</strong></div></div>)}</div><button className="add-item-btn" onClick={()=>setItems(old=>[...old,blankItem()])}><Plus size={16}/> Add another item</button></div>
     <div className="form-card"><div className="section-title"><span className="step-number">04</span><div><h2>Tax & payment</h2><p>Check the applicable GST treatment before issuing.</p></div></div><div className="field-grid"><Field label="GST calculation mode"><select value={taxMode} onChange={e=>setTaxMode(e.target.value as 'IGST'|'SPLIT')}><option value="IGST">IGST</option><option value="SPLIT">CGST + SGST</option></select></Field><Field label="Discount (₹)"><input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(Number(e.target.value))}/></Field><Field label="Amount already paid (₹)"><input type="number" min="0" max={total} step="0.01" value={amountPaid} onChange={e=>setAmountPaid(Number(e.target.value))}/></Field><Field label="Work completion status"><select value={workStatus} onChange={e=>setWorkStatus(e.target.value as 'PENDING'|'PARTIAL'|'COMPLETED')}><option value="PENDING">Pending</option><option value="PARTIAL">Partially completed</option><option value="COMPLETED">Completed</option></select></Field></div><div className="note-box">Subtotal: {money(subtotal)} · Tax: {money(tax)} · Total: {money(total)}. Confirm the legal invoice details and GST treatment before issuing.</div></div></div>
     {showPreview&&<div className="preview-column"><div className="preview-top"><span><Eye size={15}/> LIVE PREVIEW</span><span>A4 · PORTRAIT</span></div><div className="paper"><div className="paper-topline">NavRasa IT Solutions | Jaipur, Rajasthan</div><div className="paper-header"><div className="paper-brand"><img
  src="/navrasa-logo.png"
  alt="NavRasa"
  className="paper-logo"
/><div><b>NAVRASA</b><span>IT SOLUTIONS</span></div></div><div className="paper-invoice"><h2>TAX INVOICE</h2><span>Invoice No.: {invoiceNo||'Not assigned'}</span><span>Invoice Date: {dateLabel(date)}</span>{dueDate&&<span>Due Date: {dateLabel(dueDate)}</span>}</div></div><div className="paper-rule"/><div className="bill-grid"><div><b>BILLED BY</b><strong>NavRasa IT Solutions</strong><span>Shyam Nagar, Jaipur, Rajasthan, India - 302019</span><span>GSTIN: 08AAZFN3030G1Z2</span><span>PAN: AAZFN3030G</span><span>info@navrasaitsolutions.com</span><span>+91 63770 67867</span></div><div><b>BILLED TO</b><strong>{client.name||'Client legal name'}</strong><span>{client.address||'Billing address'}</span><span>GST Number: {client.gstin||'—'}</span><span>Contact: {client.phone||'—'}</span></div></div><div className="supply-band"><span>Country of Supply: India</span><span>Place of Supply: {place||'—'}</span></div><table className="paper-table"><thead><tr><th>#</th><th>Item / Description</th><th>GST</th><th>Amount</th><th>Tax</th><th>Total</th></tr></thead><tbody>{items.map((it,i)=><tr key={it.id}><td>{i+1}</td><td>{it.description||'Service description'}<small>SAC: {it.sac||'—'}</small></td><td>{it.gst}%</td><td>{money(it.qty*it.rate)}</td><td>{money(it.qty*it.rate*it.gst/100)}</td><td>{money(it.qty*it.rate*(1+it.gst/100))}</td></tr>)}</tbody></table><div className="paper-bottom"><div className="bank"><b>BANK DETAILS</b><span>Account Name: NavRasa IT Solutions</span><span>Account Number: 50200118244157</span><span>IFSC: HDFC0007653</span><span>Account Type: Current</span><span>Bank: HDFC Bank</span><span>UPI ID: navrasa@ybl</span></div><div className="totals"><div><span>Amount</span><b>{money(subtotal)}</b></div>{taxMode==='IGST'?<div><span>IGST</span><b>{money(tax)}</b></div>:<><div><span>CGST</span><b>{money(tax/2)}</b></div><div><span>SGST</span><b>{money(tax/2)}</b></div></>}<div><span>Discount</span><b>{money(discount)}</b></div><div className="grand-total"><b>Total (INR)</b><b>{money(total)}</b></div><div><span>Received</span><b>{money(amountPaid)}</b></div><div><span>Balance</span><b>{money(Math.max(0,total-amountPaid))}</b></div></div></div><div className="amount-words"><span>Amount in Words:</span><b>{amountWords(total)}</b></div><div className="terms"><b>TERMS & CONDITIONS</b><p>1. Payment shall be made within the due date mentioned on this invoice.</p><p>2. GST has been charged as per applicable provisions of the GST Act.</p><p>3. This invoice covers only the services described above.</p><p>4. Additional work beyond the agreed scope shall be billed separately upon prior approval.</p><p>5. Delayed payments may result in suspension of maintenance services until outstanding dues are cleared.</p></div><div className="paper-disclaimer">This is a computer-generated invoice and does not require a physical signature.<br/>For any enquiry, reach out via finance@navrasaitsolutions.com or call +91 63770 67867</div><div className="paper-footer">NavRasa IT Solutions • www.navrasaitsolutions.com</div></div><div className="preview-note"><CheckCircle2 size={15}/> Preview updates automatically. Verify company/bank details before issuing.</div></div>}
    </div></section>}
  </main>{toast&&<div className="toast"><CheckCircle2 size={17}/>{toast}<button onClick={()=>setToast('')}><X size={15}/></button></div>}
 </div>;
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

type AuthScreenProps = {
  mode: 'login' | 'register';
  setMode: (mode: 'login' | 'register') => void;
  businessName: string;
  setBusinessName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  busy: boolean;
  error: string;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
};

function AuthScreen({
  mode,
  setMode,
  businessName,
  setBusinessName,
  email,
  setEmail,
  password,
  setPassword,
  busy,
  error,
  onSubmit,
}: AuthScreenProps) {
  const registering = mode === 'register';

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="brand auth-brand">
          <img
          src="/navrasa-logo.png"
          alt="NavRasa"
          className="brand-logo"
          />
          <div>
            <strong>NAVRASA</strong>
            <span>INVOICE STUDIO</span>
          </div>
        </div>

        <div className="auth-heading">
          <div className="eyebrow">BUSINESS WORKSPACE</div>
          <h1>{registering ? 'Create your account' : 'Welcome back'}</h1>
          <p>
            {registering
              ? 'Set up your business workspace to manage invoices and clients.'
              : 'Sign in to access your invoices and business records.'}
          </p>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            <CircleAlert size={17} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={onSubmit}>
          {registering && (
            <Field label="Business name">
              <input
                required
                autoComplete="organization"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Your registered business name"
                maxLength={150}
              />
            </Field>
          )}

          <Field label="Email address">
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </Field>

          <Field label="Password">
            <input
              required
              type="password"
              autoComplete={
                registering ? 'new-password' : 'current-password'
              }
              minLength={registering ? 12 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                registering
                  ? 'At least 12 characters'
                  : 'Enter your password'
              }
            />
          </Field>

          <button
            className="primary-btn auth-submit"
            type="submit"
            disabled={busy}
          >
            {busy
              ? 'Please wait...'
              : registering
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>

        <div className="auth-switch">
          {registering
            ? 'Already have an account?'
            : "Don't have an account?"}{' '}
          <button
            type="button"
            className="text-btn"
            onClick={() => setMode(registering ? 'login' : 'register')}
            disabled={busy}
          >
            {registering ? 'Sign in' : 'Create account'}
          </button>
        </div>

        <p className="auth-footer">
          Your workspace is accessible after authentication.
        </p>
      </section>
    </main>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
  warning = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  warning?: boolean;
}) {
  return (
    <div className={`stat-card${warning ? ' warning' : ''}`}>
      <div className="stat-card-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </div>
  );
}

function InvoiceTable({
  invoices,
  onPayment,
  onEdit,
  onWorkStatus,
  empty,
}: {
  invoices: Invoice[];
  onPayment: (invoice: Invoice) => void;
  onEdit: (invoice: Invoice) => void;
  onWorkStatus: (invoice: Invoice, status: string) => void;
  empty: string;
}) {
  if (invoices.length === 0) {
    return (
      <div className="empty-state">
        <FileText size={28} />
        <h2>No invoices yet</h2>
        <p>{empty}</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>INVOICE</th>
            <th>CLIENT</th>
            <th>DATE</th>
            <th>AMOUNT</th>
            <th>STATUS</th>
            <th>PAYMENT</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => {
            const status = (
              invoice.paymentStatus ||
              invoice.status ||
              'pending'
            )
              .toLowerCase()
              .replace(/\s+/g, '-');

            return (
              <tr key={invoice.id}>
                <td>
                  <strong>{invoice.invoiceNo}</strong>
                  {invoice.dueDate && (
                    <div className="muted-cell">
                      Due {dateLabel(invoice.dueDate)}
                    </div>
                  )}
                </td>
                <td>{invoice.clientName}</td>
                <td>{dateLabel(invoice.invoiceDate)}</td>
                <td>
                  <strong>{money(invoice.total)}</strong>
                  <div className="muted-cell">
                    Paid: {money(invoice.amountPaid)}
                  </div>
                </td>
                <td>
                  <select
                    aria-label={`Work status for ${invoice.invoiceNo}`}
                    value={invoice.workStatus || 'PENDING'}
                    onChange={(e) => onWorkStatus(invoice, e.target.value)}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="PARTIAL">Partially completed</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                  <div className="muted-cell">Work progress: {Number(invoice.workProgress ?? (invoice.workStatus === 'COMPLETED' ? 100 : 0))}%</div>
                </td>
                <td>
                  <span className={`status-pill ${status}`}>{(invoice.paymentStatus || 'UNPAID').replace('PARTIAL','Partially paid').replace('UNPAID','Unpaid').replace('PAID','Paid')}</span>
                  <div className="muted-cell">Outstanding: {money(Math.max(0, invoice.total - invoice.amountPaid))}</div>
                </td>
                <td>
                  <button
                    className="row-action"
                    type="button"
                    title="Edit invoice"
                    aria-label={`Edit invoice ${invoice.invoiceNo}`}
                    onClick={() => onEdit(invoice)}
                  >
                    <FileText size={16} />
                  </button>
                  <button
                    className="row-action"
                    type="button"
                    title="Update payment"
                    aria-label={`Update payment for ${invoice.invoiceNo}`}
                    onClick={() => onPayment(invoice)}
                  >
                    <IndianRupee size={16} />
                  </button>
                  {invoice.driveWebViewLink && (
                    <button
                      className="row-action"
                      type="button"
                      title="Open saved invoice"
                      aria-label={`Open invoice ${invoice.invoiceNo}`}
                      onClick={() =>
                        window.open(
                          invoice.driveWebViewLink!,
                          '_blank',
                          'noopener,noreferrer'
                        )
                      }
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
