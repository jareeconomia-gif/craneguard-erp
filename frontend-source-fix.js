const fs=require('fs');
const path=require('path');
const cp=require('child_process');
function buildEnterpriseSource(){
  const file=path.join(__dirname,'enterprise-production.js');
  let s=fs.readFileSync(file,'utf8');
  s=s.replace("</tr>`)):empty('Sin vinculaciones'", "</tr>`))):empty('Sin vinculaciones'");
  s=s.replace("Vincula usuarios con rol Cliente.'))}`", "Vincula usuarios con rol Cliente.')}`");
  return s;
}
function writeEnterprise(dest){const s=buildEnterpriseSource();fs.writeFileSync(dest,s,'utf8');return s}
if(require.main===module){
  const tmp=path.join(__dirname,'.enterprise-generated-check.js');
  writeEnterprise(tmp);
  try{cp.execFileSync(process.execPath,['--check',tmp],{stdio:'inherit'});console.log('enterprise-production generated source: syntax OK')}
  finally{try{fs.unlinkSync(tmp)}catch{}}
}
module.exports={buildEnterpriseSource,writeEnterprise};
