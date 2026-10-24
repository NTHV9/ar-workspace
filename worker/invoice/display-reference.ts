/** Project only an explicit source Room#/CHECK# literal; the source check key
 * is never parsed to manufacture a printed identifier. */
export function explicitArPosDisplayReference(referenceText:string):string|undefined{
 const match=/^(Room#\s+[^\s:]{1,20}\s*:\s*CHECK#\s+[A-Za-z0-9_.-]{1,80})(\s+\[[0-9]{1,20}\])?([\s\S]*)$/i.exec(referenceText.trim());if(!match||!match[2]&&match[3].trim())return undefined;
 return (match[1]+match[3]).replace(/\s+/g,' ').trim();
}
/** Display-only AR reference. Inputs have already passed the invoice model's
 * text validation. Operational remarks are not an alternative reference source. */
export function invoiceDisplayReference(check:string,referenceText:string):string{
 const narrative=(referenceText.match(/Routed From [\s\S]*/i)?.[0]??'').trimEnd();
 const joinedRoom=narrative.match(/Room\s*#(\d+)$/i)?.[1];
 // Preserve the existing printed check handling, including concatenated room
 // and nine-digit check strings. Never strip a numeric suffix from a room.
 const printedCheckAtEnd=!!check&&narrative.endsWith(check)&&(/\s/.test(narrative.charAt(narrative.length-check.length-1))||!!joinedRoom&&/^\d{9}$/.test(check)&&joinedRoom.length>check.length);
 const printedCheckInRoom=/^\d{9}$/.test(check)&&[...narrative.matchAll(/\bRoom\s*#(\d+)(?=\s|$)/gi)].some(match=>match[1].length>check.length&&match[1].endsWith(check));
 const fullReference=referenceText.trim(),whitespaceEquivalent=!!check&&!!fullReference&&check!==fullReference&&check.replace(/\s+/g,'')===fullReference.replace(/\s+/g,''),explicitPos=check?explicitArPosDisplayReference(fullReference):undefined,checkWithPrefix=!!check&&(/\s/.test(check)||!fullReference.startsWith('['))&&fullReference.endsWith(check)&&fullReference.length>check.length&&/\s/.test(fullReference.charAt(fullReference.length-check.length-1)),checkWithSuffix=!!check&&fullReference.startsWith(check)&&/\s/.test(fullReference.charAt(check.length))&&!!fullReference.slice(check.length).trim();
 const packageContent=/^\[NA Pkg\. Trx\]\s+([\s\S]*)$/.exec(fullReference)?.[1]??'',packageWithSuffix=!!check&&packageContent.startsWith(check)&&/\s/.test(packageContent.charAt(check.length))&&!!packageContent.slice(check.length).trim();
 // These reserved source protocols are qualified against the current AR
 // report. Suppress only their literal marker; unknown protocols stay intact.
 const roomProtocol=/^\[(?:NA P\.Room|NA Room)\](?:\s+([\s\S]*))?$/.exec(fullReference),automaticAdd=!check&&(fullReference==='[Add: 10%.(B)]'||fullReference==='[Add: 7%.(S1)]');
 // The AR source can carry a printed-check prefix followed by split/routing
 // details. Keep that literal suffix; do not substitute operational remarks.
 return narrative?[narrative,...check&&!printedCheckAtEnd&&!printedCheckInRoom?[check]:[]].join('\n'):roomProtocol?(roomProtocol[1]??'').trim():automaticAdd?'':whitespaceEquivalent?fullReference:packageWithSuffix?packageContent:explicitPos!==undefined?explicitPos:checkWithSuffix||checkWithPrefix?fullReference:check||fullReference;
}
