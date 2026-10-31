import React from 'react';
import { Link } from 'react-router-dom';
export default function StudentLink({id,children,className=''}){
  return id?<Link to={`/admin/students/${id}`} className={`student-link ${className}`} title="View student activity">{children}</Link>:<span className={className}>{children}</span>;
}
