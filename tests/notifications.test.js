import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotifications} from '../src/ui/notifications.js';
test('quiet notifications preserve errors and do not modify the host toast API',()=>{
 const calls=[],settings={},host=Object.fromEntries(['info','success','warning','error'].map(type=>[type,(...args)=>calls.push([type,...args])]));
 const original=host.info,notices=createNotifications(settings,host);
 notices.info('start');settings.hideNonErrorNotifications=true;notices.info('queued');notices.success('done');notices.warning('notice');notices.error('failed','title',{escapeHtml:true});
 assert.deepEqual(calls,[['info','start'],['error','failed','title',{escapeHtml:true}]]);assert.equal(host.info,original);
 settings.hideNonErrorNotifications=false;notices.success('saved');assert.equal(calls.at(-1)[1],'saved');
});
