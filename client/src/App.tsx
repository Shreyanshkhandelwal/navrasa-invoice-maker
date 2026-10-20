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
  invoiceStatus?: 'DRAFT' | 'COMPLETED';
  invoiceType?: 'INVOICE' | 'PROFORMA';
  workStatus?: string;
  workProgress?: number;
  status: string;
  notes?: string | null;
  items: Item[];
  driveWebViewLink?: string | null;
};
type Dashboard = { totalInvoiced: number; totalPaid: number; outstanding: number; overdueAmount: number; invoiceCount: number; paidCount: number; pendingCount: number; overdueCount: number; recentInvoices: Invoice[] };
type CompanyProfile = {
  id: string;
  name: string;
  logoDataUrl: string | null;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  pan: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  ifsc: string | null;
  accountType: string | null;
  bankName: string | null;
  upiId: string | null;
  paymentTerms: string | null;
  invoiceFooter: string | null;
};

const blankCompanyProfile: CompanyProfile = {
  id: '',
  name: 'NavRasa IT Solutions',
  logoDataUrl: null,
  legalName: 'NavRasa IT Solutions',
  address: 'Gurjar Ki Thadi Ka Chauraha',
  phone: '7689985615',
  email: 'shreyansh@navrasaitsolutions.com',
  gstin: '',
  pan: '',
  bankAccountName: '',
  bankAccountNumber: '',
  ifsc: '',
  accountType: 'Current',
  bankName: '',
  upiId: '',
  paymentTerms: '',
  invoiceFooter: '',
};
const API = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const AUTH_TOKEN_KEY = 'navrasa_invoice_token';
const AUTH_USER_KEY = 'navrasa_invoice_user';
type AuthResponse = { token: string; user: { id: string; email: string }; business: { id: string; name: string } };
type DialogState =
  | { kind: 'payment'; invoice: Invoice; amountPaid: string; error: string }
  | { kind: 'work'; invoice: Invoice; nextStatus: 'PENDING' | 'PARTIAL' | 'COMPLETED'; amountPaid: string; error: string }
  | { kind: 'delete-client'; client: Client }
  | { kind: 'delete-invoice'; invoice: Invoice }
  | null;
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
const dialogButtonPrimary: React.CSSProperties = { border:0, borderRadius:11, background:'#202938', color:'#fff', padding:'12px 17px', fontSize:13, fontWeight:750, cursor:'pointer' };
const dialogButtonSecondary: React.CSSProperties = { border:'1px solid #cbd5e1', borderRadius:11, background:'#fff', color:'#334155', padding:'12px 17px', fontSize:13, fontWeight:700, cursor:'pointer' };

export default function App(){
 const [authToken,setAuthToken]=useState<string|null>(()=>localStorage.getItem(AUTH_TOKEN_KEY));
 const [authUser,setAuthUser]=useState<{id:string;email:string;businessName:string}|null>(()=>{try{return JSON.parse(localStorage.getItem(AUTH_USER_KEY)||'null');}catch{return null;}});
 const [page,setPage]=useState<
  'dashboard'|'invoices'|'create'|'clients'|'company-profile'
>('dashboard');
 const [dashboard,setDashboard]=useState<Dashboard|null>(null);
 const [invoices,setInvoices]=useState<Invoice[]>([]);
 const [clients,setClients]=useState<Client[]>([]);
 const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(blankCompanyProfile);
 const [profileLoading, setProfileLoading] = useState(false);
 const [profileSaving, setProfileSaving] = useState(false);
 const [profileLoaded, setProfileLoaded] = useState(false);
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
 const [editingInvoiceStatus,setEditingInvoiceStatus]=useState<'DRAFT'|'COMPLETED'|null>(null);
 const [invoiceType,setInvoiceType]=useState<'INVOICE'|'PROFORMA'>('INVOICE');
 const [invoiceView,setInvoiceView]=useState<'INVOICE'|'PROFORMA'>('INVOICE');
 const [workStatus,setWorkStatus]=useState<'PENDING'|'PARTIAL'|'COMPLETED'>('PENDING');
 const [search,setSearch]=useState('');
 const [clientSearch,setClientSearch]=useState('');
 const [toast,setToast]=useState('');
 const [googleDrive, setGoogleDrive] = useState<{
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
 }>({
  connected: false,
  email: null,
  connectedAt: null,
 });
 const [googleDriveLoading, setGoogleDriveLoading] = useState(false);
 const [googleDriveBusy, setGoogleDriveBusy] = useState(false);

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
 const [dialog,setDialog]=useState<DialogState>(null);
 const [dialogBusy,setDialogBusy]=useState(false);
 const subtotal=useMemo(()=>items.reduce((s,i)=>s+Math.max(0,i.qty)*Math.max(0,i.rate),0),[items]);
 const tax=useMemo(()=>items.reduce((s,i)=>s+Math.max(0,i.qty)*Math.max(0,i.rate)*Math.max(0,i.gst)/100,0),[items]);
 const total=Math.max(0,subtotal+tax-discount);
 const notify=(s:string)=>{setToast(s);window.setTimeout(()=>setToast(''),3500)};
 const loadDashboard=useCallback(async()=>{try{setDashboard(await api<Dashboard>('/api/dashboard'));}catch(e){setError(e instanceof Error?e.message:'Could not load dashboard');}},[]);
 const loadInvoices=useCallback(async()=>{try{setInvoices(await api<Invoice[]>(`/api/invoices?q=${encodeURIComponent(search)}`));}catch(e){setError(e instanceof Error?e.message:'Could not load invoices');}},[search]);
 const loadClients=useCallback(async()=>{try{setClients(await api<Client[]>(`/api/clients?q=${encodeURIComponent(clientSearch)}`));}catch(e){setError(e instanceof Error?e.message:'Could not load clients');}},[clientSearch]);
 const loadCompanyProfile = useCallback(async () => {
  setProfileLoading(true);
  setError('');

  try {
    const result = await api<{ profile: CompanyProfile }>(
      '/api/company-profile'
    );

    const profile = {
      ...blankCompanyProfile,
      ...result.profile,
    };

    // Apply defaults only when a saved field is empty.
    setCompanyProfile({
      ...profile,
      name: profile.name?.trim() || blankCompanyProfile.name,
      legalName: profile.legalName?.trim() || blankCompanyProfile.legalName,
      address: profile.address?.trim() || blankCompanyProfile.address,
      phone: profile.phone?.trim() || blankCompanyProfile.phone,
      email: profile.email?.trim() || blankCompanyProfile.email,
    });
    setProfileLoaded(true);
  } catch (e) {
    setError(
      e instanceof Error ? e.message : 'Could not load company profile'
    );
  } finally {
    setProfileLoading(false);
  }
}, []);

async function saveCompanyProfile() {
  if (!companyProfile.name.trim()) {
    notify('Company name is required.');
    return;
  }

  setProfileSaving(true);

  try {
    const result = await api<{ profile: CompanyProfile }>(
      '/api/company-profile',
      {
        method: 'PUT',
        body: JSON.stringify(companyProfile),
      }
    );

    const savedProfile = {
      ...blankCompanyProfile,
      ...result.profile,
    };

    setCompanyProfile(savedProfile);

    const currentUser = localStorage.getItem(AUTH_USER_KEY);
    if (currentUser) {
      const parsed = JSON.parse(currentUser);
      const updatedUser = {
        ...parsed,
        businessName: savedProfile.name,
      };

      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updatedUser));
      setAuthUser(updatedUser);
    }

    setProfileLoaded(true);
    notify('Company profile saved successfully.');
  } catch (e) {
    notify(
      e instanceof Error ? e.message : 'Could not save company profile'
    );
  } finally {
    setProfileSaving(false);
  }
}
 async function handleCompanyLogo(file?: File) {
  if (!file) return;

  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    notify('Choose a PNG, JPEG, or WebP logo.');
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    notify('Logo must be 2 MB or smaller.');
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    if (typeof reader.result === 'string') {
      setCompanyProfile(old => ({
        ...old,
        logoDataUrl: reader.result as string,
      }));
    }
  };

  reader.onerror = () => notify('Could not read the selected logo.');
  reader.readAsDataURL(file);
}
 const refreshAll=useCallback(async()=>{if(!localStorage.getItem(AUTH_TOKEN_KEY))return;setLoading(true);setError('');try{await Promise.all([loadDashboard(),loadInvoices(),...(page==='clients'?[loadClients()]:[])]);}finally{setLoading(false);}},[loadDashboard,loadInvoices,loadClients,page]);
 
const refreshGoogleDrive = useCallback(async () => {
  if (!localStorage.getItem(AUTH_TOKEN_KEY)) return;

  setGoogleDriveLoading(true);

  try {
    const result = await api<{
      connected: boolean;
      email: string | null;
      connectedAt: string | null;
    }>('/api/google/status');

    setGoogleDrive(result);
  } catch (e) {
    setError(
      e instanceof Error
        ? e.message
        : 'Could not check Google Drive status.'
    );
  } finally {
    setGoogleDriveLoading(false);
  }
}, []);

 useEffect(()=>{
  if(!authToken)return;
  setLoading(true);
  setError('');
  void loadDashboard().finally(()=>setLoading(false));
 },[authToken,loadDashboard]);
 
useEffect(() => {
  if (authToken) {
    void refreshGoogleDrive();
  } else {
    setGoogleDrive({
      connected: false,
      email: null,
      connectedAt: null,
    });
  }
}, [authToken, refreshGoogleDrive]);

useEffect(() => {
  if (!authToken) return;

  const params = new URLSearchParams(window.location.search);
  const connected = params.get('googleConnected');
  const googleError = params.get('googleError');

  if (connected !== 'true' && !googleError) return;

  window.history.replaceState(
    {},
    document.title,
    window.location.pathname
  );

  if (connected === 'true') {
    setToast('Google Drive connected successfully.');
    void refreshGoogleDrive();
  } else if (googleError) {
    setToast(googleError);
  }
}, [authToken, refreshGoogleDrive]);

 useEffect(()=>{const expire=()=>{setAuthToken(null);setAuthUser(null);setDashboard(null);setInvoices([]);setClients([]);};window.addEventListener('navrasa-auth-expired',expire);return()=>window.removeEventListener('navrasa-auth-expired',expire);},[]);
 async function submitAuth(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setAuthBusy(true);setAuthError('');try{const result=await api<AuthResponse>(authMode==='register'?'/api/auth/register':'/api/auth/login',{method:'POST',body:JSON.stringify({email:authEmail,password:authPassword,...(authMode==='register'?{businessName:authBusinessName}:{})})});localStorage.setItem(AUTH_TOKEN_KEY,result.token);const savedUser={id:result.user.id,email:result.user.email,businessName:result.business.name};localStorage.setItem(AUTH_USER_KEY,JSON.stringify(savedUser));setAuthUser(savedUser);setAuthToken(result.token);setAuthPassword('');}catch(e){setAuthError(e instanceof Error?e.message:'Authentication failed.');}finally{setAuthBusy(false);}}
 function logout(){localStorage.removeItem(AUTH_TOKEN_KEY);localStorage.removeItem(AUTH_USER_KEY);setAuthToken(null);setAuthUser(null);setDashboard(null);setInvoices([]);setClients([]);setPage('dashboard');}
 useEffect(()=>{
  if(!authToken||page!=='clients')return;
  const timeout=window.setTimeout(()=>void loadClients(),250);
  return ()=>window.clearTimeout(timeout);
 },[authToken,page,loadClients]);
 useEffect(() => {
  if (authToken && page === 'company-profile') {
    void loadCompanyProfile();
  }
}, [authToken, page, loadCompanyProfile]);
 useEffect(()=>{
  if(!authToken)return;
  const timeout=window.setTimeout(()=>void loadInvoices(),250);
  return ()=>window.clearTimeout(timeout);
 },[authToken,loadInvoices]);
 const updateItem=(id:number,key:keyof Item,value:string|number)=>setItems(old=>old.map(i=>i.id===id?{...i,[key]:value}:i));
 const newInvoice=()=>{setEditingInvoiceId(null);setEditingInvoiceStatus(null);setInvoiceType(invoiceView);setWorkStatus('PENDING');setInvoiceNo('');setDate(today());setDueDate('');setPlace('');setTaxMode('IGST');setDiscount(0);setAmountPaid(0);setClient({...blankClient});setItems([blankItem()]);setPage('create');setError('');};
 
 async function disconnectGoogleDrive() {
  const confirmed = window.confirm(
    'Disconnect Google Drive for this business? Existing invoices and saved PDFs will not be deleted.'
  );

  if (!confirmed) return;

  setGoogleDriveBusy(true);

  try {
    await api('/api/google/disconnect', {
      method: 'DELETE',
    });

    setGoogleDrive({
      connected: false,
      email: null,
      connectedAt: null,
    });

    setToast('Google Drive disconnected.');
  } catch (e) {
    setToast(
      e instanceof Error
        ? e.message
        : 'Could not disconnect Google Drive.'
    );
  } finally {
    setGoogleDriveBusy(false);
  }
}

 function editInvoice(inv:Invoice){
  setEditingInvoiceId(inv.id);setEditingInvoiceStatus(inv.invoiceStatus === 'DRAFT' ? 'DRAFT' : 'COMPLETED');setInvoiceType(inv.invoiceType === 'PROFORMA' ? 'PROFORMA' : 'INVOICE');setInvoiceNo(inv.invoiceNo);setDate(inv.invoiceDate?inv.invoiceDate.slice(0,10):today());setDueDate(inv.dueDate?inv.dueDate.slice(0,10):'');setPlace(inv.placeOfSupply||'');setTaxMode(inv.taxMode==='SPLIT'?'SPLIT':'IGST');setDiscount(Number(inv.discount)||0);setAmountPaid(Number(inv.amountPaid)||0);
  setWorkStatus(inv.workStatus==='COMPLETED'?'COMPLETED':inv.workStatus==='PARTIAL'?'PARTIAL':'PENDING');
  setClient({name:inv.clientName||'',address:inv.clientAddress||'',gstin:inv.clientGstin||'',phone:inv.clientPhone||'',email:inv.clientEmail||''});
  const savedItems=Array.isArray(inv.items)?inv.items:[];
  setItems(savedItems.length?savedItems.map((item,index)=>({...item,id:Date.now()+index,qty:Number(item.qty)||0,rate:Number(item.rate)||0,gst:Number(item.gst)||0})):[blankItem()]);
  setError('');setPage('create');
 }
 const chooseClient=(id:string)=>{const c=clients.find(x=>x.id===id);if(c)setClient({name:c.name,address:c.address||'',gstin:c.gstin||'',phone:c.phone||'',email:c.email||''});};
 const payload=(invoiceStatus: 'DRAFT'|'COMPLETED' = editingInvoiceStatus || 'COMPLETED', fileName?: string)=>({invoiceNo:invoiceNo.trim(),date,dueDate,place,taxMode,discount,amountPaid,workStatus,client,items,subtotal,tax,total,amountWords:amountWords(total),invoiceStatus,invoiceType,...(fileName ? {fileName} : {})});
 async function saveInvoice(invoiceStatus: 'DRAFT' | 'COMPLETED' = editingInvoiceStatus || 'COMPLETED'){
   if(!invoiceNo.trim()||!client.name.trim()||!items.length||items.some(i=>!i.description.trim()||!Number.isFinite(i.qty)||i.qty<=0||!Number.isFinite(i.rate)||i.rate<0)){notify('Enter an invoice number, client name and valid line items.');return;}
   if(amountPaid<0||amountPaid>total){notify('Amount paid must be between ₹0 and the invoice total.');return;}
   setLoading(true);setError('');
   try{
    const isEditing=Boolean(editingInvoiceId);
    const saved=await api<Invoice>(isEditing?`/api/invoices/${editingInvoiceId}`:'/api/invoices',{method:isEditing?'PUT':'POST',body:JSON.stringify(payload(invoiceStatus))});
    await refreshAll();
    setEditingInvoiceId(saved.id);
    setEditingInvoiceStatus(saved.invoiceStatus === 'DRAFT' ? 'DRAFT' : 'COMPLETED');
    notify(invoiceStatus==='DRAFT'?'Draft saved successfully.':isEditing?'Invoice updated successfully.':'Invoice saved to PostgreSQL.');
    setPage('invoices');
   }catch(e){notify(e instanceof Error?e.message:'Could not save invoice');}
   finally{setLoading(false);}
  }
  async function downloadInvoice(){
   if(!invoiceNo.trim()||!client.name.trim()||!items.length||items.some(i=>!i.description.trim()||!Number.isFinite(i.qty)||i.qty<=0||!Number.isFinite(i.rate)||i.rate<0)){notify('Enter an invoice number, client name and valid line items.');return;}
   if(amountPaid<0||amountPaid>total){notify('Amount paid must be between ₹0 and the invoice total.');return;}
   const baseInvoice = /^invoice/i.test(invoiceNo.trim()) ? invoiceNo.trim() : `Invoice${invoiceNo.trim()}`;
   const defaultName = `${baseInvoice}_${client.name.trim()}`.replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,'_');
   const enteredName = window.prompt('File name for download and Google Drive (without .pdf is fine):', defaultName);
   if (enteredName === null) return;
   const fileName = enteredName.trim().replace(/\.pdf$/i,'');
   if (!fileName) { notify('Please enter a valid PDF filename.'); return; }
   try{
    setLoading(true);
    const res=await fetch(`${API}/api/invoices/pdf`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)||''}`},body:JSON.stringify(payload('COMPLETED',fileName))});
    if(!res.ok){let m='Could not generate PDF';try{m=(await res.json()).error||m;}catch{}throw new Error(m);}
    const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${fileName.replace(/[\\/:*?"<>|]/g,'-')}.pdf`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    await refreshAll();setEditingInvoiceId(null);setEditingInvoiceStatus(null);
    notify(invoiceType==='PROFORMA'?'Proforma PDF generated and saved.':'PDF generated and invoice stored as completed.');setPage('invoices');
   }catch(e){notify(e instanceof Error?e.message:'Could not generate PDF');}
   finally{setLoading(false);}
  }
  function updatePayment(inv:Invoice){setDialog({kind:'payment',invoice:inv,amountPaid:String(inv.amountPaid ?? 0),error:''});}
 function updateWorkStatus(inv:Invoice,nextStatus:string){
  if(nextStatus!=='PENDING'&&nextStatus!=='PARTIAL'&&nextStatus!=='COMPLETED')return;
  const currentPaid=Number(inv.amountPaid)||0;
  const initialPaid=nextStatus==='COMPLETED'?Number(inv.total):nextStatus==='PENDING'?0:(currentPaid>0&&currentPaid<Number(inv.total)?currentPaid:Math.max(0,Math.round(Number(inv.total)/2*100)/100));
  setDialog({kind:'work',invoice:inv,nextStatus,amountPaid:String(initialPaid),error:''});
 }
 async function saveDialog(){
  if(!dialog||dialogBusy)return;
  if(dialog.kind==='delete-client'){
   setDialogBusy(true);try{await api(`/api/clients/${dialog.client.id}`,{method:'DELETE'});await loadClients();setDialog(null);notify('Client deleted. Existing invoices were not changed.');}catch(e){notify(e instanceof Error?e.message:'Could not delete client');}finally{setDialogBusy(false);}return;
  }
  if(dialog.kind==='delete-invoice'){
   setDialogBusy(true);try{await api(`/api/invoices/${dialog.invoice.id}`,{method:'DELETE'});setDialog(null);await refreshAll();notify(`Invoice ${dialog.invoice.invoiceNo} deleted.`);}catch(e){notify(e instanceof Error?e.message:'Could not delete invoice');}finally{setDialogBusy(false);}return;
  }
  const current=dialog;
  const amount=Number(current.amountPaid);
  if(!Number.isFinite(amount)||amount<0||amount>Number(current.invoice.total)){
   setDialog({...current,error:`Enter an amount between ₹0 and ${money(current.invoice.total)}.`});return;
  }
  setDialogBusy(true);
  try{
   if(current.kind==='payment'){
    await api(`/api/invoices/${current.invoice.id}/payment`,{method:'PATCH',body:JSON.stringify({amountPaid:amount})});
    setDialog(null);await refreshAll();notify('Payment record updated.');
   }else{
    const amountPaid=current.nextStatus==='COMPLETED'?Number(current.invoice.total):current.nextStatus==='PENDING'?0:amount;
    if(current.nextStatus==='PARTIAL'&&(amountPaid<=0||amountPaid>=Number(current.invoice.total))){setDialog({...current,error:'For a partially paid invoice, the amount received must be greater than ₹0 and less than the invoice total.'});return;}
    await api(`/api/invoices/${current.invoice.id}/payment`,{method:'PATCH',body:JSON.stringify({amountPaid})});
    setDialog(null);await refreshAll();notify(current.nextStatus==='COMPLETED'?'Invoice marked as paid.':current.nextStatus==='PENDING'?'Invoice marked as unpaid.':'Partial payment saved.');
   }
  }catch(e){setDialog({...current,error:e instanceof Error?e.message:'Could not save changes'});}finally{setDialogBusy(false);}
 }
 async function saveClient(){if(!clientForm.name.trim()){notify('Client name is required.');return;}setSavingClient(true);try{if(editingClient)await api(`/api/clients/${editingClient}`,{method:'PUT',body:JSON.stringify(clientForm)});else await api('/api/clients',{method:'POST',body:JSON.stringify(clientForm)});setClientForm({...blankClient});setEditingClient(null);await loadClients();notify('Client saved to PostgreSQL.');}catch(e){notify(e instanceof Error?e.message:'Could not save client');}finally{setSavingClient(false);}}
 async function deleteClient(c:Client){setDialog({kind:'delete-client',client:c});}
 function deleteInvoice(invoice:Invoice){setDialog({kind:'delete-invoice',invoice});}
const nav = (
  p: 'dashboard' | 'invoices' | 'create' | 'clients' | 'company-profile'
) => {
  setError('');
  setPage(p);
};
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
   <button className={`nav-item ${page==='clients'?'active':''}`} onClick={()=>nav('clients')}><Users size={18}/> Clients <span className="nav-count">{clients.length}</span></button><div className="nav-label">PREFERENCES</div><button
  className={`nav-item ${page === 'company-profile' ? 'active' : ''}`}
  onClick={() => nav('company-profile')}
>
  <Settings size={18} /> Company profile
</button>
   <div className="sidebar-bottom"><div className="help-card"><div className="help-icon">✦</div><strong>Live database</strong><p>Invoices and clients are loaded from your PostgreSQL database.</p><button onClick={()=>void refreshAll()}>Refresh data <RefreshCw size={14}/></button></div><div className="user-profile"><div className="avatar">{(authUser?.businessName||'B').slice(0,2).toUpperCase()}</div><div><strong>{authUser?.email || 'Signed in'}</strong><span>{authUser?.businessName || 'Business workspace'}</span></div><button className="text-btn" onClick={logout}>Log out</button></div></div>
  </aside>
  <main className="main-area"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>{page === 'create'
  ? 'New invoice'
  : page === 'clients'
    ? 'Clients'
    : page === 'invoices'
      ? 'Invoices'
      : page === 'company-profile'
        ? 'Company Profile'
        : 'Overview'}</b></div><div className="top-actions"><div className="status-pill"><span/> {loading?'Syncing database':'Database connected'}</div><button className="icon-btn" title="Refresh" onClick={()=>void refreshAll()}><RefreshCw size={18}/></button><div className="avatar small">NR</div></div></header>
   {error&&<div className="error-banner"><CircleAlert size={17}/><span>{error} — confirm the API is running at {API}.</span><button onClick={()=>setError('')}><X size={15}/></button></div>}
   {page==='dashboard'&&<section className="page-content"><div className="page-heading"><div><div className="eyebrow">LIVE DATABASE SUMMARY</div><h1>Invoice overview <span>✦</span></h1><p>Figures below are calculated from records saved in PostgreSQL.</p></div><button className="primary-btn" onClick={newInvoice}><Plus size={18}/> Create invoice</button></div>
    <div className="stats-grid"><Stat icon={<IndianRupee/>} label="Total invoiced" value={money(dashboard?.totalInvoiced||0)} note={`${dashboard?.invoiceCount||0} saved invoices`} /><Stat icon={<CheckCircle2/>} label="Payments received" value={money(dashboard?.totalPaid||0)} note={`${dashboard?.paidCount||0} fully paid invoices`}/><Stat icon={<Clock3/>} label="Outstanding" value={money(dashboard?.outstanding||0)} note={`${dashboard?.pendingCount||0} awaiting payment`}/><Stat icon={<FileText/>} label="Overdue balance" value={money(dashboard?.overdueAmount||0)} note={`${dashboard?.overdueCount||0} overdue invoices`} warning={Boolean(dashboard?.overdueCount)}/></div>
    <div className="content-card invoice-list-card"><div className="card-heading"><div><h2>Recent invoices</h2><p>Latest records from your database.</p></div><button className="text-btn" onClick={()=>nav('invoices')}>View all invoices <ArrowUpRight size={15}/></button></div><div className="table-tools"><div className="searchbox"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search invoice number or client..."/></div><button className="filter-btn" onClick={()=>void refreshAll()}><RefreshCw size={14}/> Refresh</button></div><InvoiceTable invoices={invoices.slice(0,6)} onPayment={updatePayment} onEdit={editInvoice} onDelete={deleteInvoice} onWorkStatus={updateWorkStatus} empty="No invoices have been saved yet. Create an invoice to see real records here."/></div>
    <div className="bottom-grid">
<div className="content-card drive-card">
  <div className="drive-logo">
    <CloudUpload size={22} />
  </div>

  <div className="drive-copy">
    <h3>Google Drive sync</h3>

    {googleDriveLoading ? (
      <p>Checking Google Drive connection...</p>
    ) : googleDrive.connected ? (
      <>
        <p>
          Connected account: <strong>{googleDrive.email}</strong>
        </p>

        <div className="inline-actions">
          <button
            className="secondary-btn"
            disabled={googleDriveBusy}
            onClick={() => void connectGoogleDrive()}
          >
            Change account <ArrowUpRight size={15} />
          </button>

          <button
            className="secondary-btn"
            disabled={googleDriveBusy}
            onClick={() => void disconnectGoogleDrive()}
          >
            {googleDriveBusy ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      </>
    ) : (
      <>
        <p>
          No Google Drive account is connected to this business.
          Connect an account to upload generated invoice PDFs.
        </p>

        <button
          className="secondary-btn"
          onClick={() => void connectGoogleDrive()}
        >
          Connect Google Drive <ArrowUpRight size={15} />
        </button>
      </>
    )}
  </div>

  <span className={googleDrive.connected ? 'connected' : 'not-connected'}>
    {googleDriveLoading
      ? 'Checking...'
      : googleDrive.connected
        ? 'Connected'
        : 'Not connected'}
  </span>
</div>
<div className="content-card tip-card"><div className="tip-symbol">✦</div><div><h3>No demo figures</h3><p>Summary totals update when invoices and payments are saved. A new database starts at zero until real records are entered.</p></div></div></div>
   </section>}
   {page==='invoices'&&<section className="page-content"><div className="page-heading"><div><div className="eyebrow">DATABASE RECORDS</div><h1>{invoiceView==='PROFORMA'?'Proforma Invoices':'Invoices'}</h1><p>Manage, edit, and download your {invoiceView==='PROFORMA'?'proforma invoices':'regular invoices'}.</p></div><button className="primary-btn" onClick={newInvoice}><Plus size={18}/> Create {invoiceView==='PROFORMA'?'proforma invoice':'invoice'}</button></div><div className="invoice-view-tabs"><button className={invoiceView==='INVOICE'?'active':''} onClick={()=>setInvoiceView('INVOICE')}>Invoices <span>{invoices.filter(i=>i.invoiceType!=='PROFORMA').length}</span></button><button className={invoiceView==='PROFORMA'?'active':''} onClick={()=>setInvoiceView('PROFORMA')}>Proforma Invoices <span>{invoices.filter(i=>i.invoiceType==='PROFORMA').length}</span></button></div><div className="content-card invoice-list-card"><div className="table-tools"><div className="searchbox"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search invoice number or client..."/></div><button className="filter-btn" onClick={()=>void loadInvoices()}><RefreshCw size={14}/> Refresh</button></div><InvoiceTable invoices={invoices.filter(i=>invoiceView==='PROFORMA'?i.invoiceType==='PROFORMA':i.invoiceType!=='PROFORMA')} onPayment={updatePayment} onEdit={editInvoice} onDelete={deleteInvoice} onWorkStatus={updateWorkStatus} empty={invoiceView==='PROFORMA'?'No proforma invoices yet. Use Create proforma invoice to add one.':'No invoices found. Use Create invoice to add the first genuine record.'}/></div></section>}
   {page==='clients'&&<section className="page-content"><div className="page-heading"><div><div className="eyebrow">SAVED CONTACTS</div><h1>Clients</h1><p>Client details are saved to PostgreSQL and can be reused on invoices.</p></div></div><div className="content-card form-card client-admin"><div className="section-title"><span className="step-number">{editingClient?'EDIT':'NEW'}</span><div><h2>{editingClient?'Edit client':'Add a client'}</h2><p>Only enter details supplied or verified by the client.</p></div></div><div className="field-grid"><Field label="Legal entity name"><input value={clientForm.name} onChange={e=>setClientForm({...clientForm,name:e.target.value})} placeholder="Registered company name"/></Field><Field label="GSTIN"><input value={clientForm.gstin||''} onChange={e=>setClientForm({...clientForm,gstin:e.target.value})} placeholder="Optional"/></Field><Field label="Phone"><input value={clientForm.phone||''} onChange={e=>setClientForm({...clientForm,phone:e.target.value})} placeholder="Contact number"/></Field><Field label="Email"><input type="email" value={clientForm.email||''} onChange={e=>setClientForm({...clientForm,email:e.target.value})} placeholder="Billing email"/></Field></div><Field label="Billing address"><textarea rows={2} value={clientForm.address} onChange={e=>setClientForm({...clientForm,address:e.target.value})} placeholder="Registered billing address"/></Field><div className="inline-actions"><button className="primary-btn" disabled={savingClient} onClick={()=>void saveClient()}><Save size={16}/>{savingClient?'Saving...':editingClient?'Update client':'Save client'}</button>{editingClient&&<button className="secondary-btn" onClick={()=>{setEditingClient(null);setClientForm({...blankClient});}}>Cancel</button>}</div></div><div className="content-card invoice-list-card"><div className="card-heading"><div><h2>Client directory</h2><p>{clients.length} saved clients</p></div></div><div className="table-tools"><div className="searchbox"><Search size={17}/><input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder="Search clients..."/></div></div><div className="table-wrap"><table><thead><tr><th>CLIENT</th><th>GSTIN</th><th>PHONE</th><th>EMAIL</th><th></th></tr></thead><tbody>{clients.map(c=><tr key={c.id}><td><strong>{c.name}</strong><div className="muted-cell">{c.address||'No billing address saved'}</div></td><td>{c.gstin||'—'}</td><td>{c.phone||'—'}</td><td>{c.email||'—'}</td><td><button className="row-action" title="Edit" onClick={()=>{setEditingClient(c.id);setClientForm({name:c.name,address:c.address||'',gstin:c.gstin||'',phone:c.phone||'',email:c.email||''});}}><Eye size={16}/></button><button className="row-action danger-action" title="Delete" onClick={()=>void deleteClient(c)}><Trash2 size={16}/></button></td></tr>)}</tbody></table>{clients.length===0&&<div className="empty-state"><Users size={28}/><h2>No saved clients</h2><p>Save a client here or create an invoice; client details entered on invoices are also stored.</p></div>}</div></div></section>}
   {page === 'company-profile' && (
  <section className="page-content">
    <div className="page-heading">
      <div>
        <div className="eyebrow">BUSINESS SETTINGS</div>
        <h1>Company Profile</h1>
        <p>
          Manage your business identity, billing details and payment
          information used on invoices.
        </p>
      </div>
    </div>

    {profileLoading ? (
      <div className="content-card form-card">Loading company profile...</div>
    ) : (
      <>
        <div className="content-card form-card">
          <div className="section-title">
            <span className="step-number">01</span>
            <div>
              <h2>Business information</h2>
              <p>Use your registered and verified business details.</p>
            </div>
          </div>

          <div className="field-grid">
            <Field label="Company name *">
              <input
                value={companyProfile.name}
                onChange={e => setCompanyProfile(p => ({ ...p, name: e.target.value }))}
                required
                maxLength={150}
              />
            </Field>

            <Field label="Legal name">
              <input
                value={companyProfile.legalName || ''}
                onChange={e => setCompanyProfile(p => ({ ...p, legalName: e.target.value }))}
              />
            </Field>

            <Field label="Company email">
              <input
                type="email"
                value={companyProfile.email || ''}
                onChange={e => setCompanyProfile(p => ({ ...p, email: e.target.value }))}
              />
            </Field>

            <Field label="Phone">
              <input
                value={companyProfile.phone || ''}
                onChange={e => setCompanyProfile(p => ({ ...p, phone: e.target.value }))}
              />
            </Field>

            <Field label="GSTIN">
              <input
                value={companyProfile.gstin || ''}
                onChange={e => setCompanyProfile(p => ({ ...p, gstin: e.target.value.toUpperCase() }))}
              />
            </Field>

            <Field label="PAN">
              <input
                value={companyProfile.pan || ''}
                onChange={e => setCompanyProfile(p => ({ ...p, pan: e.target.value.toUpperCase() }))}
              />
            </Field>
          </div>

          <Field label="Registered address">
            <textarea
              rows={3}
              value={companyProfile.address || ''}
              onChange={e => setCompanyProfile(p => ({ ...p, address: e.target.value }))}
            />
          </Field>

          <Field label="Company logo (PNG, JPEG or WebP; max 2 MB)">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={e => void handleCompanyLogo(e.target.files?.[0])}
            />
          </Field>

          {companyProfile.logoDataUrl && (
            <div className="inline-actions">
              <img
                src={companyProfile.logoDataUrl}
                alt="Company logo preview"
                style={{ maxWidth: 160, maxHeight: 90, objectFit: 'contain' }}
              />
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setCompanyProfile(p => ({ ...p, logoDataUrl: null }))}
              >
                Remove logo
              </button>
            </div>
          )}
        </div>

        <div className="content-card form-card">
          <div className="section-title">
            <span className="step-number">02</span>
            <div>
              <h2>Bank and payment details</h2>
              <p>These details can be displayed on your invoices.</p>
            </div>
          </div>

          <div className="field-grid">
            <Field label="Account holder name">
              <input
                value={companyProfile.bankAccountName || ''}
                onChange={e => setCompanyProfile(p => ({ ...p, bankAccountName: e.target.value }))}
              />
            </Field>

            <Field label="Bank name">
              <input
                value={companyProfile.bankName || ''}
                onChange={e => setCompanyProfile(p => ({ ...p, bankName: e.target.value }))}
              />
            </Field>

            <Field label="Account number">
              <input
                value={companyProfile.bankAccountNumber || ''}
                onChange={e => setCompanyProfile(p => ({ ...p, bankAccountNumber: e.target.value }))}
              />
            </Field>

            <Field label="IFSC">
              <input
                value={companyProfile.ifsc || ''}
                onChange={e => setCompanyProfile(p => ({ ...p, ifsc: e.target.value.toUpperCase() }))}
              />
            </Field>

            <Field label="Account type">
              <select
                value={companyProfile.accountType || ''}
                onChange={e => setCompanyProfile(p => ({ ...p, accountType: e.target.value }))}
              >
                <option value="">Select account type</option>
                <option value="Current">Current</option>
                <option value="Savings">Savings</option>
                <option value="Other">Other</option>
              </select>
            </Field>

            <Field label="UPI ID">
              <input
                value={companyProfile.upiId || ''}
                onChange={e => setCompanyProfile(p => ({ ...p, upiId: e.target.value }))}
              />
            </Field>
          </div>
        </div>

        <div className="content-card form-card">
          <div className="section-title">
            <span className="step-number">03</span>
            <div>
              <h2>Invoice defaults</h2>
              <p>Set your standard payment terms and invoice footer.</p>
            </div>
          </div>

          <Field label="Payment terms">
            <textarea
              rows={3}
              value={companyProfile.paymentTerms || ''}
              onChange={e => setCompanyProfile(p => ({ ...p, paymentTerms: e.target.value }))}
              placeholder="Enter your standard payment terms"
            />
          </Field>

          <Field label="Invoice footer">
            <textarea
              rows={3}
              value={companyProfile.invoiceFooter || ''}
              onChange={e => setCompanyProfile(p => ({ ...p, invoiceFooter: e.target.value }))}
              placeholder="Enter contact information or other invoice footer text"
            />
          </Field>

          <div className="inline-actions">
            <button
              className="primary-btn"
              disabled={profileSaving || profileLoading}
              onClick={() => void saveCompanyProfile()}
            >
              <Save size={16} />
              {profileSaving ? 'Saving...' : 'Save company profile'}
            </button>
          </div>
        </div>
      </>
    )}
  </section>
)}
   {page==='create'&&<section className="builder-page"><div className="builder-heading"><div><button className="back-link" onClick={()=>nav('invoices')}>← Back to invoices</button><h1>{editingInvoiceId?'Edit': 'Create'} {invoiceType==='PROFORMA'?'proforma invoice':'invoice'}</h1><p>Enter verified billing details. Invoice numbers must be unique and follow your company’s numbering policy.</p></div><div className="builder-actions"><button className="secondary-btn" onClick={()=>setShowPreview(v=>!v)}><Eye size={16}/>{showPreview?'Hide preview':'Show preview'}</button><button className="secondary-btn" disabled={loading} onClick={()=>void saveInvoice('DRAFT')}><Save size={16}/> Save as Draft</button><button className="primary-btn" disabled={loading} onClick={()=>void downloadInvoice()}><Download size={17}/>{loading?'Working...':'Generate PDF & save to Drive'}</button></div></div>
    <div className={`builder-grid ${showPreview?'':'no-preview'}`}><div className="editor-column"><div className="form-card"><div className="section-title"><span className="step-number">01</span><div><h2>Invoice details</h2><p>Enter the actual invoice number and dates.</p></div></div><div className="field-grid"><Field label="Document type"><select value={invoiceType} onChange={e=>setInvoiceType(e.target.value as 'INVOICE'|'PROFORMA')}><option value="INVOICE">Invoice</option><option value="PROFORMA">Proforma Invoice</option></select></Field><Field label="Invoice number *"><input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="e.g. 17/26-27"/></Field><Field label="Invoice date"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label="Due date"><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></Field><Field label="Place of supply"><input value={place} onChange={e=>setPlace(e.target.value)} placeholder="e.g. Rajasthan (08)"/></Field></div></div>
     <div className="form-card"><div className="section-title"><span className="step-number">02</span><div><h2>Client information</h2><p>Choose a saved client or enter their verified details.</p></div></div><Field label="Use saved client"><select defaultValue="" onChange={e=>chooseClient(e.target.value)}><option value="">Enter a new client / choose saved client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.gstin?` · ${c.gstin}`:''}</option>)}</select></Field><Field label="Client / legal entity name *"><input value={client.name} onChange={e=>setClient({...client,name:e.target.value})} placeholder="Registered legal name"/></Field><Field label="Billing address"><textarea rows={2} value={client.address} onChange={e=>setClient({...client,address:e.target.value})} placeholder="Billing address"/></Field><div className="field-grid"><Field label="GSTIN"><input value={client.gstin||''} onChange={e=>setClient({...client,gstin:e.target.value})} placeholder="Optional"/></Field><Field label="Contact number"><input value={client.phone||''} onChange={e=>setClient({...client,phone:e.target.value})} placeholder="Optional"/></Field></div><Field label="Billing email"><input type="email" value={client.email||''} onChange={e=>setClient({...client,email:e.target.value})} placeholder="Optional"/></Field></div>
     <div className="form-card"><div className="section-title"><span className="step-number">03</span><div><h2>Items & services</h2><p>Enter the actual contracted services, quantities and rates.</p></div></div><div className="items-editor">{items.map((item,idx)=><div className="item-edit" key={item.id}><div className="item-edit-top"><span>ITEM {String(idx+1).padStart(2,'0')}</span><button className="delete-btn" onClick={()=>setItems(old=>old.filter(i=>i.id!==item.id))} title="Remove item"><Trash2 size={15}/></button></div><Field label="Description *"><input value={item.description} onChange={e=>updateItem(item.id,'description',e.target.value)} placeholder="Description of service or product"/></Field><div className="field-grid three"><Field label="SAC / HSN code"><input value={item.sac} onChange={e=>updateItem(item.id,'sac',e.target.value)} placeholder="If applicable"/></Field><Field label="Quantity"><input type="number" min="0.01" step="any" value={item.qty} onChange={e=>updateItem(item.id,'qty',Number(e.target.value))}/></Field><Field label="Rate (₹)"><input type="number" min="0" step="0.01" value={item.rate} onChange={e=>updateItem(item.id,'rate',Number(e.target.value))}/></Field></div><div className="item-bottom"><label>GST rate <select value={item.gst} onChange={e=>updateItem(item.id,'gst',Number(e.target.value))}><option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option></select></label><strong>{money(item.qty*item.rate)}</strong></div></div>)}</div><button className="add-item-btn" onClick={()=>setItems(old=>[...old,blankItem()])}><Plus size={16}/> Add another item</button></div>
     <div className="form-card"><div className="section-title"><span className="step-number">04</span><div><h2>Tax & payment</h2><p>Check the applicable GST treatment before issuing.</p></div></div><div className="field-grid"><Field label="GST calculation mode"><select value={taxMode} onChange={e=>setTaxMode(e.target.value as 'IGST'|'SPLIT')}><option value="IGST">IGST</option><option value="SPLIT">CGST + SGST</option></select></Field><Field label="Discount (₹)"><input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(Number(e.target.value))}/></Field><Field label="Amount received so far (₹)"><input type="number" min="0" max={total} step="0.01" value={amountPaid} onChange={e=>setAmountPaid(Number(e.target.value))}/></Field><Field label="Payment status"><select value={amountPaid<=0?'PENDING':amountPaid>=total?'COMPLETED':'PARTIAL'} onChange={e=>{const status=e.target.value as 'PENDING'|'PARTIAL'|'COMPLETED';setWorkStatus(status);setAmountPaid(status==='PENDING'?0:status==='COMPLETED'?total:Math.max(0,Math.min(total-0.01,Math.round(total/2*100)/100)));}}><option value="PENDING">Unpaid</option><option value="PARTIAL">Partially paid</option><option value="COMPLETED">Paid</option></select></Field></div><div className="note-box">Subtotal: {money(subtotal)} · Tax: {money(tax)} · Total: {money(total)}. Confirm the legal invoice details and GST treatment before issuing.</div></div></div>
     {showPreview&&<div className="preview-column"><div className="preview-top"><span><Eye size={15}/> LIVE PREVIEW</span><span>A4 · PORTRAIT</span></div><div className="paper"><div className="paper-topline">{companyProfile.name || "NavRasa IT Solutions"} | {companyProfile.address || "Jaipur, Rajasthan"}</div><div className="paper-header"><div className="paper-brand"><img src={companyProfile.logoDataUrl || "/navrasa-logo.png"} alt="NavRasa" className="paper-logo"/><div><b>NAVRASA</b><span>IT SOLUTIONS</span></div></div><div className="paper-invoice"><h2>{invoiceType==='PROFORMA'?'PROFORMA INVOICE':'TAX INVOICE'}</h2><span>Invoice No.: {invoiceNo||'Not assigned'}</span><span>Invoice Date: {dateLabel(date)}</span>{dueDate&&<span>Due Date: {dateLabel(dueDate)}</span>}</div></div><div className="paper-rule"/><div className="bill-grid"><div><b>BILLED BY</b><strong>{companyProfile.legalName || companyProfile.name || "NavRasa IT Solutions"}</strong><span>{companyProfile.address}</span><span>GSTIN: {companyProfile.gstin || "—"}</span><span>PAN: {companyProfile.pan || "—"}</span><span>{companyProfile.email}</span><span>{companyProfile.phone}</span></div><div><b>BILLED TO</b><strong>{client.name||'Client legal name'}</strong><span>{client.address||'Billing address'}</span><span>GST Number: {client.gstin||'—'}</span><span>Contact: {client.phone||'—'}</span></div></div><div className="supply-band"><span>Country of Supply: India</span><span>Place of Supply: {place||'—'}</span></div><table className="paper-table"><thead><tr><th>#</th><th>Item / Description</th><th>GST</th><th>Amount</th><th>Tax</th><th>Total</th></tr></thead><tbody>{items.map((it,i)=><tr key={it.id}><td>{i+1}</td><td>{it.description||'Service description'}<small>SAC: {it.sac||'—'}</small></td><td>{it.gst}%</td><td>{money(it.qty*it.rate)}</td><td>{money(it.qty*it.rate*it.gst/100)}</td><td>{money(it.qty*it.rate*(1+it.gst/100))}</td></tr>)}</tbody></table><div className="paper-bottom"><div className="bank"><b>BANK DETAILS</b><span>Account Name: {companyProfile.bankAccountName}</span><span>Account Number: {companyProfile.bankAccountNumber}</span><span>IFSC: {companyProfile.ifsc}</span><span>Account Type: {companyProfile.accountType}</span><span>Bank: {companyProfile.bankName}</span><span>UPI ID: {companyProfile.upiId}</span></div><div className="totals"><div><span>Amount</span><b>{money(subtotal)}</b></div>{taxMode==='IGST'?<div><span>IGST</span><b>{money(tax)}</b></div>:<><div><span>CGST</span><b>{money(tax/2)}</b></div><div><span>SGST</span><b>{money(tax/2)}</b></div></>}<div><span>Discount</span><b>{money(discount)}</b></div><div className="grand-total"><b>Total (INR)</b><b>{money(total)}</b></div><div><span>Received</span><b>{money(amountPaid)}</b></div><div><span>Balance</span><b>{money(Math.max(0,total-amountPaid))}</b></div></div></div><div className="amount-words"><span>Amount in Words:</span><b>{amountWords(total)}</b></div><div className="terms"><b>TERMS & CONDITIONS</b>{(companyProfile.paymentTerms || "Payment shall be made within the due date mentioned on this invoice.\nGST has been charged as per applicable provisions of the GST Act.").split(/\n?\n/).filter(Boolean).map((term, index) => <p key={index}>{index + 1}. {term}</p>)}</div><div className="paper-disclaimer">This is a computer-generated invoice and does not require a physical signature.<br/>For any enquiry, reach out via {companyProfile.email || "your registered email"} or call {companyProfile.phone || "your registered phone"}</div><div className="paper-footer">{companyProfile.invoiceFooter || companyProfile.name || "NavRasa IT Solutions"}</div></div><div className="preview-note"><CheckCircle2 size={15}/> Preview updates automatically. Verify company/bank details before issuing.</div></div>}
    </div></section>}
  </main>{toast&&<div className="toast"><CheckCircle2 size={17}/>{toast}<button onClick={()=>setToast('')}><X size={15}/></button></div>}
  {dialog&&<div role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!dialogBusy)setDialog(null);}} style={{position:'fixed',inset:0,zIndex:2000,background:'rgba(15,23,42,.58)',backdropFilter:'blur(5px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
   <section role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" style={{width:'100%',maxWidth:dialog.kind==='work'?520:460,maxHeight:'90vh',overflowY:'auto',background:'#fff',color:'#172033',borderRadius:20,boxShadow:'0 24px 80px rgba(0,0,0,.28)',padding:28}}>
    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16,marginBottom:20}}>
     <div><div style={{fontSize:11,fontWeight:800,letterSpacing:1.5,color:'#64748b',textTransform:'uppercase',marginBottom:8}}>{dialog.kind==='payment'?'Payment management':dialog.kind==='work'?'Payment management':dialog.kind==='delete-invoice'?'Invoice management':'Client directory'}</div><h2 id="app-dialog-title" style={{fontSize:23,lineHeight:1.25,margin:0,fontWeight:750}}>{dialog.kind==='payment'?'Update payment received':dialog.kind==='delete-client'?'Delete this client?':dialog.kind==='delete-invoice'?'Delete this invoice?':dialog.nextStatus==='PARTIAL'?'Record partial payment':dialog.nextStatus==='COMPLETED'?'Mark invoice as paid':'Mark invoice as unpaid'}</h2><p style={{margin:'8px 0 0',fontSize:14,lineHeight:1.5,color:'#64748b'}}>{dialog.kind==='payment'?`Invoice ${dialog.invoice.invoiceNo} · Total ${money(dialog.invoice.total)}`:dialog.kind==='work'?`Invoice ${dialog.invoice.invoiceNo} · Total ${money(dialog.invoice.total)}`:dialog.kind==='delete-invoice'?`Invoice ${dialog.invoice.invoiceNo} for ${dialog.invoice.clientName} · Total ${money(dialog.invoice.total)}`:`Delete ${dialog.client.name} from your client directory? Existing invoices will remain unchanged.`}</p></div>
     <button type="button" aria-label="Close dialog" disabled={dialogBusy} onClick={()=>setDialog(null)} style={{border:0,background:'#f1f5f9',borderRadius:10,width:36,height:36,flexShrink:0,cursor:'pointer',display:'grid',placeItems:'center'}}><X size={18}/></button>
    </div>
    {dialog.kind==='payment'&&<form onSubmit={e=>{e.preventDefault();void saveDialog();}}>
     <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}><div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:12,padding:14}}><div style={{fontSize:12,color:'#64748b',marginBottom:6}}>Invoice total</div><strong style={{fontSize:17}}>{money(dialog.invoice.total)}</strong></div><div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:12,padding:14}}><div style={{fontSize:12,color:'#64748b',marginBottom:6}}>Outstanding balance</div><strong style={{fontSize:17}}>{money(Math.max(0,dialog.invoice.total-Number(dialog.amountPaid)))}</strong></div></div>
     <label style={{display:'block',fontSize:13,fontWeight:700,marginBottom:8}}>Total amount received so far (₹)</label><input autoFocus type="number" min="0" max={dialog.invoice.total} step="0.01" value={dialog.amountPaid} onChange={e=>setDialog({...dialog,amountPaid:e.target.value,error:''})} style={{boxSizing:'border-box',width:'100%',border:'1px solid #cbd5e1',borderRadius:11,padding:'13px 14px',fontSize:16,outlineColor:'#334155'}}/><p style={{fontSize:12,color:'#64748b',margin:'8px 0 0'}}>Enter the cumulative amount received, not just the latest instalment.</p>
     {dialog.error&&<p role="alert" style={{color:'#b91c1c',fontSize:13,marginTop:12}}>{dialog.error}</p>}
     <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:24}}><button type="button" disabled={dialogBusy} onClick={()=>setDialog(null)} style={dialogButtonSecondary}>Cancel</button><button type="submit" disabled={dialogBusy} style={dialogButtonPrimary}>{dialogBusy?'Saving…':'Save payment'}</button></div>
    </form>}
    {dialog.kind==='work'&&<form onSubmit={e=>{e.preventDefault();void saveDialog();}}>
     {dialog.nextStatus==='PARTIAL'?<><label style={{display:'block',fontSize:13,fontWeight:700,marginBottom:8}}>Total amount received so far (₹)</label><input autoFocus type="number" min="0.01" max={Math.max(0,Number(dialog.invoice.total)-0.01)} step="0.01" value={dialog.amountPaid} onChange={e=>setDialog({...dialog,amountPaid:e.target.value,error:''})} style={{boxSizing:'border-box',width:'100%',border:'1px solid #cbd5e1',borderRadius:11,padding:'13px 14px',fontSize:16}}/><p style={{fontSize:12,color:'#64748b',margin:'8px 0 0'}}>Invoice total: {money(dialog.invoice.total)} · Outstanding after save: {money(Math.max(0,dialog.invoice.total-Number(dialog.amountPaid)))}</p></>:<div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:12,padding:16,fontSize:14,lineHeight:1.6}}>{dialog.nextStatus==='COMPLETED'?<>This will record the full invoice total as received: <strong>{money(dialog.invoice.total)}</strong>.</>:<>This will set the amount received to <strong>₹0</strong> and the full invoice total will remain outstanding.</>}</div>}
     {dialog.error&&<p role="alert" style={{color:'#b91c1c',fontSize:13,marginTop:12}}>{dialog.error}</p>}
     <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:24}}><button type="button" disabled={dialogBusy} onClick={()=>setDialog(null)} style={dialogButtonSecondary}>Cancel</button><button type="submit" disabled={dialogBusy} style={dialogButtonPrimary}>{dialogBusy?'Saving…':dialog.nextStatus==='PARTIAL'?'Save partial payment':'Confirm payment status'}</button></div>
    </form>}
    {(dialog.kind==='delete-client'||dialog.kind==='delete-invoice')&&<div><p style={{fontSize:14,lineHeight:1.6,color:'#475569',margin:'0 0 20px'}}>{dialog.kind==='delete-invoice'?'This permanently removes the invoice and its saved line items. This action cannot be undone.':'Delete this client from your client directory? Existing invoices will remain unchanged.'}</p><div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:24}}><button type="button" disabled={dialogBusy} onClick={()=>setDialog(null)} style={dialogButtonSecondary}>Cancel</button><button type="button" disabled={dialogBusy} onClick={()=>void saveDialog()} style={{...dialogButtonPrimary,background:'#b91c1c'}}>{dialogBusy?'Deleting…':dialog.kind==='delete-invoice'?'Delete invoice':'Delete client'}</button></div></div>}
   </section>
  </div>}
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

async function connectGoogleDrive() {
  try {
    const result = await api<{ url: string }>('/api/google/connect');

    if (!result.url) {
      throw new Error('Google authorization URL was not returned.');
    }

    window.location.assign(result.url);
  } catch (error) {
    window.alert(
      error instanceof Error
      ? error.message
      : 'Could not connect Google Drive.'
    );
  }
}

function InvoiceTable({
  invoices,
  onPayment,
  onEdit,
  onWorkStatus,
  onDelete,
  empty,
}: {
  invoices: Invoice[];
  onPayment: (invoice: Invoice) => void;
  onEdit: (invoice: Invoice) => void;
  onWorkStatus: (invoice: Invoice, status: string) => void;
  onDelete: (invoice: Invoice) => void;
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
                  {invoice.invoiceType === 'PROFORMA' && <div style={{display:'inline-block',marginLeft:8,padding:'3px 7px',borderRadius:5,background:'#e0e7ff',color:'#3730a3',fontSize:10,fontWeight:800,letterSpacing:0.5}}>PROFORMA</div>}{invoice.invoiceStatus === 'DRAFT' && <div style={{display:'inline-block',marginLeft:8,padding:'3px 7px',borderRadius:5,background:'#fff3cd',color:'#856404',fontSize:10,fontWeight:800,letterSpacing:0.5}}>DRAFT</div>}
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
                  {invoice.invoiceType === 'PROFORMA' ? <span className="muted-cell">Not tracked</span> : <select
                    aria-label={`Payment status for ${invoice.invoiceNo}`}
                    value={Number(invoice.amountPaid)<=0?'PENDING':Number(invoice.amountPaid)>=Number(invoice.total)?'COMPLETED':'PARTIAL'}
                    onChange={(e) => onWorkStatus(invoice, e.target.value)}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="PARTIAL">Partially paid</option>
                    <option value="COMPLETED">Paid</option>
                  </select>}
                </td>
                <td>
                  {invoice.invoiceType === 'PROFORMA' ? <span className="muted-cell">Proforma</span> : <><span className={`status-pill ${status}`}>{(invoice.paymentStatus || 'UNPAID').replace('PARTIAL','Partially paid').replace('UNPAID','Unpaid').replace('PAID','Paid')}</span><div className="muted-cell">Outstanding: {money(Math.max(0, invoice.total - invoice.amountPaid))}</div></>}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8, whiteSpace: 'nowrap' }}>
                    <button
                      className="row-action"
                      type="button"
                      title="Edit invoice"
                      aria-label={`Edit invoice ${invoice.invoiceNo}`}
                      onClick={() => onEdit(invoice)}
                    >
                      <FileText size={16} />
                    </button>
                    {invoice.invoiceType !== 'PROFORMA' && <button
                      className="row-action"
                      type="button"
                      title="Update payment"
                      aria-label={`Update payment for ${invoice.invoiceNo}`}
                      onClick={() => onPayment(invoice)}
                    >
                      <IndianRupee size={16} />
                    </button>}
                    <button
                      className="row-action danger-action"
                      type="button"
                      title="Delete invoice"
                      aria-label={`Delete invoice ${invoice.invoiceNo}`}
                      onClick={() => onDelete(invoice)}
                    >
                      <Trash2 size={16} />
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
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
