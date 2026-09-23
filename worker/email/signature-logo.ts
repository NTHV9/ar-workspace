import {signatureLogoBase64} from './signature-logo-data';
import {unbase64} from './crypto';
import {signatureLogoId} from '../../src/email/signature';
export const signatureLogoFile=()=>({name:'Katathani-Signature-Logo.png',mime:'image/png',bytes:unbase64(signatureLogoBase64),inlineId:signatureLogoId});
