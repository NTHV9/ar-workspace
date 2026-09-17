import {createContext,useContext} from 'react';
import type {UserAccess} from './model';
export const WorkspaceAccessContext=createContext<UserAccess|null>(null);
export const useWorkspaceMember=()=>useContext(WorkspaceAccessContext);
