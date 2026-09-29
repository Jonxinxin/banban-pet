const fs=require('node:fs');const path=require('node:path');const sharp=require('sharp');
const root=path.join(__dirname,'..');
(async()=>{
  for(const character of ['cat','dog']){
  const name=character==='dog'?'dog-icon':'icon';
  const cat=fs.readFileSync(path.join(root,`assets/${character}.svg`),'utf8').replace('<g class="cat-cup">','<g class="cat-cup" opacity="0">').replace('<g class="cat-happy-eyes"','<g opacity="0" class="cat-happy-eyes"');
  const png=await sharp(Buffer.from(cat)).resize(256,256).png().toBuffer();
  fs.writeFileSync(path.join(root,`assets/${name}.png`),png);
  const head=Buffer.alloc(22);head.writeUInt16LE(1,2);head.writeUInt16LE(1,4);head[6]=0;head[7]=0;head.writeUInt16LE(1,10);head.writeUInt16LE(32,12);head.writeUInt32LE(png.length,14);head.writeUInt32LE(22,18);
  fs.writeFileSync(path.join(root,`assets/${name}.ico`),Buffer.concat([head,png]));
  console.log(`Generated ${name}.png and ${name}.ico`);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
