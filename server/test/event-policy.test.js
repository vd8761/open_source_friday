const {test}=require('node:test');
const assert=require('node:assert/strict');
const {eventPolicy}=require('../event-policy');
test('event deletion and archive policy agrees in the UI and backend across lifecycle boundaries',async()=>{
  const ui=await import('../../client/src/utils/episodeTime.js');
  const ep={event_date:'2026-10-30',event_time:'7:00 PM - 8:00 PM',is_test:false};
  const cases=[
    [ep,'2026-10-30T13:29:59Z',true,false],
    [ep,'2026-10-30T13:30:00Z',false,false],
    [ep,'2026-10-30T14:29:59Z',false,false],
    [ep,'2026-10-30T14:30:00Z',false,true],
    [{...ep,is_silent:true},'2026-10-31T00:00:00Z',false,true],
    [{...ep,is_test:true},'2026-10-31T00:00:00Z',true,true],
    [{...ep,archived_at:'2026-10-31'},'2026-10-31T00:00:00Z',false,false],
    [{...ep,event_time:'invalid'},'2026-10-31T00:00:00Z',false,false],
  ];
  for(const [e,now,canDelete,canArchive]of cases){const n=Date.parse(now);assert.deepEqual(ui.eventPolicy(e,n),eventPolicy(e,n));assert.equal(eventPolicy(e,n).can_delete,canDelete);assert.equal(eventPolicy(e,n).can_archive,canArchive);}
});
