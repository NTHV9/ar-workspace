import {normalizedDashboardParams} from './dashboard/links';

const callbackKeys=['code','error','error_code','error_description'];
export const hasAuthCallback=(params:URLSearchParams)=>callbackKeys.some(key=>params.has(key));

/** Bare workspace entry opens Aging; existing page/filter bookmarks keep their destination. */
export function initialWorkspaceParams(input:URLSearchParams){
 const params=normalizedDashboardParams(input);
 if([...params.keys()].every(key=>callbackKeys.includes(key))){
  params.set('dashboard','1');params.set('dashboardView','aging');
 }
 // The Auth SDK reads the untouched browser URL. Do not carry its one-time code into navigation.
 for(const key of callbackKeys)params.delete(key);
 return params;
}
