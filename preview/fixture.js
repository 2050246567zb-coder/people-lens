import './mock-chrome.js';
const script=document.createElement('script');script.src='/extension/content.js';document.body.append(script);
let editorGeneration=0;
document.addEventListener('click',e=>{
  if(e.target.closest('#theme-toggle')){document.body.classList.toggle('dark');document.querySelector('#theme-toggle').textContent=document.body.classList.contains('dark')?'切换浅色':'切换深色';return;}
  const button=e.target.closest('.comment-item .reply');if(button){const item=button.closest('.comment-item'),name=item.querySelector('.author .name').textContent;document.querySelector('.reply-content').hidden=false;document.querySelector('.reply-label').textContent='回复 '+name;const generation=++editorGeneration,old=document.querySelector('#content-textarea'),next=old?old.cloneNode(true):document.createElement('p');next.id='content-textarea';next.contentEditable='true';next.setAttribute('aria-label','回复输入框');old?.remove();setTimeout(()=>{if(generation===editorGeneration){document.querySelector('.composer').prepend(next);next.focus();}},80);}
  if(e.target.closest('.btn.cancel')){document.querySelector('.reply-content').hidden=true;document.querySelector('#content-textarea').textContent='';}
});
