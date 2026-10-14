import {WorkflowEntrypoint,type WorkflowEvent,type WorkflowStep} from 'cloudflare:workers';
import {runTrackerWake,type TrackerWatchEnv} from './watch';

export class ArTrackerWorkflow extends WorkflowEntrypoint<TrackerWatchEnv,{id:string}>{
 async run(event:WorkflowEvent<{id:string}>,step:WorkflowStep){
  return runTrackerWake(this.env,event.payload.id,step);
 }
}
