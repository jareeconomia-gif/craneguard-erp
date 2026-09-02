const fs=require('fs');
const path=require('path');
function buildEnterpriseSource(){
  const file=path.join(__dirname,'enterprise-production.js');
  let s=fs.readFileSync(file,'utf8');
  s=s.replace(") ):empty('Sin vinculaciones'", ") )):empty('Sin vinculaciones'");
  // Exact current source: panel(table(map(...))) needs one extra close before ternary.
  s=s.replace("</tr>`)):empty('Sin vinculaciones'", "</tr>`))):empty('Sin vinculaciones'");
  return s;
}
function writeEnterprise(dest){const s=buildEnterpriseSource();fs.writeFileSync(dest,s,'utf8');return s}
if(require.main===module){
  const s=buildEnterpriseSource();
  try{new Function(s);console.log('enterprise-production generated source: syntax OK')}catch(e){console.error(e);process.exit(1)}
}
module.exports={buildEnterpriseSource,writeEnterprise};
