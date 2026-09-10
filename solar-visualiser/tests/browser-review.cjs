// Reproducible, isolated HTTP + file:// browser checks. Node 22+ and Chrome required.
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const appRoot=path.resolve(__dirname,'..'),output=fs.mkdtempSync(path.join(os.tmpdir(),'broom-review-')),profile=path.join(output,'chrome-profile');
const chrome=process.env.CHROME_BIN||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'google-chrome');
const children=[];
function start(command,args,options={}){const child=spawn(command,args,options);children.push(child);return child;}
function banner(child,pattern,stream){return new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Timed out starting process: '+text.slice(-1000))),15000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);reject(Error('Process exited before ready: '+code+' '+text.slice(-1000)));});child[stream].on('data',chunk=>{text+=chunk;const match=text.match(pattern);if(match){clearTimeout(timer);resolve(match[1]);}});});}
(async()=>{
 const server=start(process.env.PYTHON_BIN||'python3',['-u','-m','http.server','0','--bind','127.0.0.1'],{cwd:appRoot,stdio:['ignore','pipe','pipe']});
 const port=await banner(server,/port (\d+)/,'stdout');
 const browser=start(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--allow-file-access-from-files','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
 const ws=await banner(browser,/DevTools listening on (ws:\/\/[^\s]+)/,'stderr');
 for(const script of ['browser-reconstruction.cjs','browser-survey.cjs','browser-ashp-workflow.cjs'])await new Promise((resolve,reject)=>{const child=start(process.execPath,[path.join(__dirname,script)],{stdio:'inherit',env:{...process.env,REVIEW_CDP_URL:ws,REVIEW_HTTP_URL:'http://127.0.0.1:'+port,REVIEW_TEST_OUTPUT:output}});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(script+' failed: '+code)));});
 console.log('Browser review passed. Screenshots and test exports: '+output);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const child of children)if(child.exitCode===null)child.kill();});
