import fs from "node:fs";
const path="client/src/pages/Home.tsx";
let source=fs.readFileSync(path,"utf8");
const old='const download=()=>toast.success("Professional PDF report generated and downloaded.");';
const next='const download=()=>{const report=["Nutrition DSS Prediction Report","Child ID: "+r.childId,"Risk: "+r.risk,"Probability: "+r.probability.toFixed(2),"Risk score: "+r.riskScore+" / 100","Prediction: "+r.prediction].join("\\n");const blob=new Blob([report],{type:"text/plain;charset=utf-8"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=`${r.childId}-prediction-report.txt`;anchor.click();URL.revokeObjectURL(url);toast.success("Prediction report downloaded.");};';
if(!source.includes(old)) throw new Error("download handler not found");
source=source.replace(old,next);
fs.writeFileSync(path,source);
