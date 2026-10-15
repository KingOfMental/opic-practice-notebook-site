export const TOPICS=['게임하기','공원 가기','해변 가기','카페 가기','음악 감상하기','사진 촬영하기','걷기','조깅','헬스','국내여행','해외여행','집에서 보내는 휴가'];
export const TYPES=['묘사','일상 및 습관','과거 경험','비교','롤플레이','문제 해결','돌발 상황'];
export const EXPRESSION_TYPES=['관용구 및 숙어','구동사','원어민식 구어체','생생한 묘사','연결 표현','현대적인 일상 표현','슬랭','필러'];
const str={type:'string',minLength:1,maxLength:40000};
const id={type:'string',minLength:1,maxLength:200};
const arr=(items,maxItems=100)=>({type:'array',items,maxItems});
const obj=(properties)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const en=(values)=>({type:'string',enum:values});
export const expressionSchema=obj({expression:str,meaningKo:str,example:str,situation:str,type:en(EXPRESSION_TYPES),opicSuitability:en(['적합','상황에 따라','일상 대화용']),suitabilityNote:str});
export const recordJsonSchema=obj({id,questionId:id,date:{type:'string',format:'date-time'},topic:en(TOPICS),questionType:en(TYPES),question:str,originalAnswer:str,correctedAnswer:str,feedback:obj({ihAssessment:str,strengths:arr(str,50),improvements:arr(str,50)}),grammarErrors:arr(obj({original:str,corrected:str,explanation:str})),expressionImprovements:arr(str),expressions:arr(expressionSchema),attempt:{type:'integer',minimum:1,maximum:10000},comparisonFeedback:{type:'string',maxLength:40000},usedExpressions:arr(str),unusedExpressions:arr(str),reviewStatus:en(['needs-review','reviewed']),isSample:{type:'boolean'}});
export const importJsonSchema={$schema:'https://json-schema.org/draft/2020-12/schema',...obj({schemaVersion:{const:'1.0'},kind:{const:'opic-learning'},records:{...arr(recordJsonSchema,5000),minItems:1}})};
export const backupJsonSchema={$schema:'https://json-schema.org/draft/2020-12/schema',...obj({schemaVersion:{const:'1.0'},kind:{const:'opic-backup'},exportedAt:{type:'string',format:'date-time'},records:arr(recordJsonSchema,5000),expressionReviews:{type:'object',additionalProperties:{type:'boolean'}}})};
export const emptyState=()=>({records:[],expressionReviews:{}});
export function validate(value,schema,path='JSON'){
 const fail=(why)=>{throw new Error(`${path}: ${why}`);};
 if(Object.hasOwn(schema,'const')&&value!==schema.const)fail(`${JSON.stringify(schema.const)}이어야 합니다.`);
 if(schema.enum&&!schema.enum.includes(value))fail(`허용값: ${schema.enum.join(', ')}`);
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('객체가 필요합니다.');
  for(const key of schema.required??[])if(!Object.hasOwn(value,key))fail(`필수 필드 ${key}가 없습니다.`);
  for(const key of Object.keys(value)){if(['__proto__','constructor','prototype'].includes(key))fail('허용되지 않는 필드입니다.');const field=schema.properties?.[key]??schema.additionalProperties;if(field===false||field===undefined)fail(`알 수 없는 필드 ${key}`);if(field!==true)validate(value[key],field,`${path}.${key}`);}
 }
 if(schema.type==='array'){
  if(!Array.isArray(value))fail('배열이 필요합니다.');
  if(value.length<(schema.minItems??0)||value.length>(schema.maxItems??Infinity))fail('배열 개수가 범위를 벗어났습니다.');
  value.forEach((v,i)=>validate(v,schema.items,`${path}[${i}]`));
 }
 if(schema.type==='string'){
  if(typeof value!=='string')fail('문자열이 필요합니다.');
  if(value.trim().length<(schema.minLength??0)||value.length>(schema.maxLength??Infinity))fail('문자열 길이가 범위를 벗어났습니다.');
  if(schema.format==='date-time'&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value))))fail('시간대가 포함된 ISO 날짜가 필요합니다.');
 }
 if(schema.type==='integer'&&(!Number.isInteger(value)||value<schema.minimum||value>schema.maximum))fail('차수는 1~10000 사이의 정수여야 합니다.');
 if(schema.type==='boolean'&&typeof value!=='boolean')fail('true 또는 false가 필요합니다.');
 return value;
}
export function parseBundle(raw){
 if(new TextEncoder().encode(raw).length>20*1024*1024)throw new Error('파일은 20MB 이하로 가져와 주세요.');
 let data;try{data=JSON.parse(raw.replace(/^\uFEFF/,'').trim());}catch{throw new Error('올바른 JSON이 아닙니다. JSON 코드만 복사해 주세요.');}
 if(!data||!['opic-learning','opic-backup'].includes(data.kind))throw new Error('kind는 opic-learning 또는 opic-backup이어야 합니다.');
 return validate(data,data.kind==='opic-backup'?backupJsonSchema:importJsonSchema);
}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const content=r=>JSON.stringify(canonical({...r,reviewStatus:'needs-review'}));
export const expressionKey=s=>s.trim().toLocaleLowerCase().replace(/\s+/g,' ');
export function mergeBundle(current,bundle,mode='merge'){
 validate(bundle,bundle.kind==='opic-backup'?backupJsonSchema:importJsonSchema);
 const state=mode==='replace'?emptyState():structuredClone(current);let added=0,duplicates=0;
 for(const r of bundle.records){
  const same=state.records.find(x=>x.id===r.id);
  if(same){if(content(same)!==content(r))throw new Error(`기록 ID 충돌: ${r.id}. 기존 기록을 보존했습니다.`);duplicates++;continue;}
  const family=state.records.filter(x=>x.questionId===r.questionId);
  if(family.some(x=>x.question!==r.question||x.topic!==r.topic||x.questionType!==r.questionType))throw new Error(`질문 ID 충돌: ${r.questionId}. 질문·주제·유형이 다릅니다.`);
  if(family.some(x=>x.attempt===r.attempt))throw new Error(`재도전 차수 충돌: ${r.questionId} / ${r.attempt}차.`);
  state.records.push(structuredClone(r));added++;
 }
 if(state.records.length>5000)throw new Error('최대 5,000개 기록까지 저장할 수 있습니다.');
 if(bundle.kind==='opic-backup')state.expressionReviews={...bundle.expressionReviews,...state.expressionReviews};
 return {state,added,duplicates};
}
export function expressionNotes(state){
 const notes=new Map();
 for(const r of [...state.records].sort((a,b)=>a.date.localeCompare(b.date)))for(const e of r.expressions){const key=expressionKey(e.expression);const prev=notes.get(key);notes.set(key,{...e,key,records:[...(prev?.records??[]),r],reviewed:state.expressionReviews[key]??false});}
 return [...notes.values()];
}
export function makeBackup(state){return {schemaVersion:'1.0',kind:'opic-backup',exportedAt:new Date().toISOString(),...state};}
export function searchRecords(records,query='',topic='전체',review='전체'){
 const q=query.trim().toLocaleLowerCase();return records.filter(r=>(topic==='전체'||r.topic===topic)&&(review==='전체'||r.reviewStatus===review)&&(!q||JSON.stringify([r.question,r.originalAnswer,r.correctedAnswer,r.feedback,r.expressions,r.topic]).toLocaleLowerCase().includes(q)));
}

