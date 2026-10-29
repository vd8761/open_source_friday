import { useEffect, useState } from 'react';
import { adminApi } from './adminApi';
export function useAdminPage(path, filters = {}) {
  const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[version,setVersion]=useState(0);
  const [result,setResult]=useState({data:[],total:0}),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const query=new URLSearchParams({...filters,page,page_size:pageSize}).toString();
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
    adminApi(`${path}?${query}`,{signal:controller.signal}).then(r=>{if(!controller.signal.aborted){setResult(r);if(page>1&&r.total<=(page-1)*pageSize)setPage(Math.max(1,Math.ceil(r.total/pageSize)));}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[path,query,version,page,pageSize]);
  return {result,loading,error,page,pageSize,setPage,setPageSize,refresh:()=>setVersion(v=>v+1)};
}
