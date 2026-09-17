export const internalUserDomain='users.ar-workspace.invalid';
export function normalizeLogin(value:unknown):{login:string;kind:'email'|'username'} {
 if(typeof value!=='string')throw Error('access_login_invalid');const login=value.trim().toLowerCase();
 if(login.includes('@')){if(login.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)||login.endsWith('@'+internalUserDomain))throw Error('access_login_invalid');return {login,kind:'email'};}
 if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(login))throw Error('access_login_invalid');return {login,kind:'username'};
}
export function validInitialPassword(value:unknown):value is string {return typeof value==='string'&&value.length>=12&&new TextEncoder().encode(value).length<=72&&!/[\u0000]/.test(value);}
