// Offline-only helper. Its caller must attest that this is a fresh private
// snapshot of ALL objects, taken after maintenance is fully deployed.
import {readFileSync} from 'node:fs';
import {assessQueueDrain} from '../queue-service/drain-status.mjs';
try{
 const path=process.argv[2];if(!path)throw Error();
 const snapshot=JSON.parse(readFileSync(path,'utf8'));
 const result=assessQueueDrain(snapshot);console.log(JSON.stringify(result,null,2));process.exitCode=result.rollbackEligible?0:2;
}catch{console.error('排空核对失败：请提供格式有效的私有全量快照，不要公开其内容。');process.exitCode=1;}
