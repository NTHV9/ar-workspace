// Keep the fallback identical to the ASCII filename emitted in our MIME.
// Gmail may expose this instead of the accompanying UTF-8 filename* value.
export const attachmentAsciiName=(name:string)=>name.replace(/[^A-Za-z0-9._ -]/g,'_');
