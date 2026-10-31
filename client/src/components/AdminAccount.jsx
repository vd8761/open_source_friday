import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import { fieldClass } from '../utils/adminApi';
export default function AdminAccount(){
  const navigate=useNavigate(),{pathname}=useLocation(),menu=useRef(null);
  const [open,setOpen]=useState(false),[current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{if(menu.current)menu.current.open=false;},[pathname]);
  async function update(){
    setError('');setMessage('');
    if(password!==confirm){setError('The new passwords do not match.');return;}
    if(password.length<6){setError('Use at least 6 characters for the new password.');return;}
    setBusy(true);
    try{const response=await fetch(`${import.meta.env.VITE_API_URL||'http://localhost:5000'}/api/change-password`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('adminToken')}`},body:JSON.stringify({oldPassword:current,newPassword:password})});const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||'Unable to change password.');setCurrent('');setPassword('');setConfirm('');setMessage('Password updated successfully. You can close this dialog.');}catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <><details ref={menu} className="relative" onKeyDown={e=>{if(e.key==='Escape')menu.current.open=false;}}><summary className="admin-action list-none">Account <span aria-hidden="true">⌄</span></summary><div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"><button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{menu.current.open=false;setError('');setMessage('');setOpen(true);}}>Change password</button><button className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50" onClick={()=>{localStorage.removeItem('adminToken');navigate('/login');}}>Sign out</button></div></details>
  {open&&<ConfirmDialog title="Change password" confirmLabel="Update password" disabled={!current||!password||!confirm||Boolean(message)} busy={busy} error={error} onCancel={()=>{setOpen(false);setCurrent('');setPassword('');setConfirm('');}} onConfirm={update}><p>Update the administrator password for your account.</p>{message&&<p role="status" className="text-emerald-700">{message}</p>}<label className="block">Current password<input type="password" autoComplete="current-password" className={fieldClass} value={current} onChange={e=>setCurrent(e.target.value)}/></label><label className="block">New password<input type="password" autoComplete="new-password" className={fieldClass} value={password} onChange={e=>setPassword(e.target.value)}/></label><label className="block">Confirm new password<input type="password" autoComplete="new-password" className={fieldClass} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label></ConfirmDialog>}</>;
}
