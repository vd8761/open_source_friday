import { adminApi, downloadFile } from './adminApi';
export async function matchingRows(path,filters,signal){
  const rows=[];let page=1,total=0;
  do {const result=await adminApi(`${path}?${new URLSearchParams({...filters,page,page_size:50})}`,{signal});total=result.total;rows.push(...result.data);if(!result.data.length)break;page++;}while(rows.length<total);
  return rows;
}
export function exportRows(rows,columns,filename){
  const cell=v=>{let text=String(v??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const csv=[columns.map(([label])=>cell(label)).join(','),...rows.map(r=>columns.map(([,key])=>cell(r[key])).join(','))].join('\r\n');
  downloadFile(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),filename);
}
