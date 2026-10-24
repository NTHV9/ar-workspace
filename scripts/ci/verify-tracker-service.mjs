import {spawnSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {isIP} from 'node:net';

// Attest the job-created service before passing its NAT address to the SQL runner.
// Never infer that an arbitrary private-address server is a disposable database.
const id=process.env.AR_CI_SERVICE_CONTAINER;
if(process.env.GITHUB_ACTIONS!=='true'||!process.env.GITHUB_ENV||!id||!/^([0-9a-f]{12,64})$/.test(id))throw Error('An explicit GitHub PostgreSQL service is required');
const result=spawnSync('docker',['inspect',id],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024,windowsHide:true});
if(result.status!==0)throw Error('The job PostgreSQL service could not be inspected');
const entries=JSON.parse(result.stdout);
if(!Array.isArray(entries)||entries.length!==1)throw Error('Ambiguous PostgreSQL service');
const service=entries[0];
if(service.Id!==id&&!service.Id?.startsWith(id))throw Error('PostgreSQL service identity changed');
if(service.Config?.Image!=='postgres:17.6'||service.State?.Running!==true)throw Error('Unexpected PostgreSQL service image or state');
const bindings=service.NetworkSettings?.Ports?.['5432/tcp'];
if(!Array.isArray(bindings)||bindings.length!==1||bindings[0].HostIp!=='127.0.0.1'||bindings[0].HostPort!=='5432')throw Error('PostgreSQL must be published on runner loopback only');
const addresses=[...new Set(Object.values(service.NetworkSettings.Networks??{}).map(network=>network.IPAddress).filter(Boolean))];
if(addresses.length!==1||isIP(addresses[0])!==4)throw Error('Ambiguous PostgreSQL service network');
appendFileSync(process.env.GITHUB_ENV,`AR_CI_EXPECT_SERVER_ADDR=${addresses[0]}\n`);
console.log('Verified the job-created, loopback-published PostgreSQL service.');
