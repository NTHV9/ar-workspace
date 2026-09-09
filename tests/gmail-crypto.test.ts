import {expect,it} from 'vitest';
import {seal,unseal} from '../worker/email/crypto';
it('encrypts provider tokens and binds ciphertext to the owner context',async()=>{const key='11'.repeat(32),value={refresh_token:'synthetic-only-token'};const encrypted=await seal(key,'owner-A',value);expect(JSON.stringify(encrypted)).not.toContain(value.refresh_token);expect(await unseal(key,'owner-A',encrypted)).toEqual(value);await expect(unseal(key,'owner-B',encrypted)).rejects.toThrow();});
