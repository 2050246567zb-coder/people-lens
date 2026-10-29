import {writeFile,mkdir} from 'node:fs/promises';import {deflateSync} from 'node:zlib';
const dir=new URL('../extension/icons/',import.meta.url);await mkdir(dir,{recursive:true});
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,data){const b=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([b,data])));return Buffer.concat([len,b,data,crc]);}
function color(x,y){
  const dx=Math.max(Math.abs(x-64)-38,0),dy=Math.max(Math.abs(y-64)-38,0);if(dx*dx+dy*dy>22*22)return [0,0,0,0];
  if((x-64)**2+(y-43)**2<15**2 || ((x-64)/30)**2+((y-96)/24)**2<1)return[255,249,239,255];
  return[191,96,68,255];
}
for(const size of [16,48,128]){
  const pixels=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++){for(let x=0;x<size;x++){const sum=[0,0,0,0];for(let a=0;a<4;a++)for(let b=0;b<4;b++){const c=color((x+(a+.5)/4)*128/size,(y+(b+.5)/4)*128/size);c.forEach((v,i)=>sum[i]+=v/16);}for(let k=0;k<4;k++)pixels[y*(size*4+1)+1+x*4+k]=Math.round(sum[k]);}}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);await writeFile(new URL(size+'.png',dir),png);
}
console.log('Generated 16/48/128px extension icons.');
