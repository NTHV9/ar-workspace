export interface WriteHoldEnv {OPERATIONS_WRITE_HOLD?:string}
/** This flag lives outside the database being restored. Old executions must also
 * be drained before restore; changing a flag cannot undo already-dispatched work. */
export const writesHeld=(env:WriteHoldEnv)=>env.OPERATIONS_WRITE_HOLD!==undefined&&env.OPERATIONS_WRITE_HOLD!=='false';
export function assertWritesEnabled(env:WriteHoldEnv){if(writesHeld(env))throw Error('operations_write_hold');}
