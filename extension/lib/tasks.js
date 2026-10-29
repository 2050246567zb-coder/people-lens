// Coalesce identical work; leaving one card does not cancel another card's task.
export class TaskHub {
  jobs = new Map();
  subscribe(key, run, listener) {
    let job = this.jobs.get(key);
    if (!job) {
      job = { controller:new AbortController(), listeners:new Set(), last:null, idleTimer:null };
      this.jobs.set(key,job);
      const emit = event => { job.last=event; for(const fn of job.listeners) fn(event); };
      job.promise = Promise.resolve().then(()=>run(job.controller.signal,emit)).then(result=>emit({type:'done',result})).catch(err=>{
        if (!job.controller.signal.aborted) emit({type:'error',message:err.message || '分析失败，请重试。'});
      }).finally(()=>{ clearTimeout(job.idleTimer); if (this.jobs.get(key)===job) this.jobs.delete(key); });
    }
    clearTimeout(job.idleTimer); job.idleTimer=null;
    job.listeners.add(listener); if(job.last) listener(job.last);
    return ({graceMs=0}={}) => {
      if(!job.listeners.delete(listener) || job.listeners.size || this.jobs.get(key)!==job)return;
      const stop=()=>{if(job.listeners.size || this.jobs.get(key)!==job)return;job.controller.abort(new DOMException('已取消','AbortError'));this.jobs.delete(key);};
      if(graceMs>0){job.idleTimer=setTimeout(stop,graceMs);job.idleTimer.unref?.();}else stop();
    };
  }
  has(key){return this.jobs.has(key) && !this.jobs.get(key).controller.signal.aborted;}
  cancelAll() { for(const job of this.jobs.values()){clearTimeout(job.idleTimer);for(const fn of job.listeners)fn({type:'error',message:'设置或缓存已更新，请重新分析。'});job.controller.abort(new DOMException('已取消','AbortError'));} this.jobs.clear(); }
}
