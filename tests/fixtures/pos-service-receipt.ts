export function serviceReceipt(kind='FOOD',date="2 Jan'26"){
 return {checkDetailsInfo:['SYNTHETIC RESTAURANT','*** VAT INCLUDED ***','CHK 0099 TBL 1/1',date+' 11:00 AM','----------------','1 Synthetic item 1,000.00 T1',kind+' THB1,000.00','Service Charge 10% THB100.00','Vat 7% THB77.00','Payment THB1,177.00','Change Due THB0.00','ROOM CHARGE THB1,177.00','----------------','--- Check Closed ---',date+' 11:10 AM'].join('\n')};
}
export function serviceInterfaces(){
 const discovery={hotelInterfaces:[{hotelId:'KAT',interfaceType:'Pos',logo:'SYN_POS_',activeFlag:true}]};
 const mapping={details:{transactionsInfo:{allChargesCode:'BASE',itemizers:[{splitCode:'SC0',splitPost:21,splitFactor:1},{splitCode:'SC2',splitPost:21,splitFactor:1}],transactionCodes:[{code:'BASE',itemizersShortInfo:[{code:'SERVICE',itemNumber:21}]}]}}};
 return {hotel:'KAT',discoveryBefore:discovery,discoveryAfter:structuredClone(discovery),mappings:[{logo:'SYN_POS_',before:mapping,after:structuredClone(mapping)}]};
}
