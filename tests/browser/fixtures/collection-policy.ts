// Fixed approved defaults for browser fixtures; no provider or customer data.
export const policyFixture={version:1,rounds:[
 {key:'Friendly',label:'Friendly',anchor:'due',offsetDays:-7,terminal:false,active:true},
 {key:'Follow 1',label:'Follow-up 1',anchor:'due',offsetDays:1,terminal:false,active:true},
 {key:'Follow 2',label:'Follow-up 2',anchor:'previous_sent',offsetDays:7,terminal:false,active:true},
 {key:'Follow 3',label:'Follow-up 3',anchor:'previous_sent',offsetDays:7,terminal:false,active:true},
 {key:'Final',label:'Final',anchor:'previous_sent',offsetDays:7,terminal:true,active:true},
]};
