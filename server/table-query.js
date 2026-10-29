const { InputError } = require('./outreach-csv');
function pageOptions(q) {
  const integer = (v, fallback, max) => {
    if (v === undefined) return fallback;
    if (!/^\d+$/.test(String(v)) || Number(v)<1 || Number(v)>max) throw new InputError('Invalid page or page size.',400);
    return Number(v);
  };
  return {page:integer(q.page,1,100000),page_size:integer(q.page_size,10,50)};
}
module.exports={pageOptions};
