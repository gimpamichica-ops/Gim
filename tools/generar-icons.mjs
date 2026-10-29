import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const crc32 = bytes => {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i=0;i<8;i++) crc = (crc>>>1)^((crc&1) ? 0xedb88320 : 0); }
  return (crc^0xffffffff)>>>0;
};
function chunk(type,data) {
  const body = Buffer.concat([Buffer.from(type),data]);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([size,body,crc]);
}
mkdirSync(new URL('../public/icons/',import.meta.url),{recursive:true});
for (const size of [180,192,512]) {
  const pixels = Buffer.alloc((size*3+1)*size);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const u=x/size,v=y/size;
    const weight = (u>.22&&u<.34&&v>.3&&v<.7)||(u>.66&&u<.78&&v>.3&&v<.7)||(u>.15&&u<.22&&v>.38&&v<.62)||(u>.78&&u<.85&&v>.38&&v<.62)||(u>.3&&u<.7&&v>.46&&v<.54);
    const offset=y*(size*3+1)+1+x*3;
    pixels.set(weight ? [59,130,246] : [5,7,13],offset);
  }
  const header=Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size,4); header[8]=8; header[9]=2;
  writeFileSync(new URL(`../public/icons/${size===180 ? 'apple-touch' : size}.png`,import.meta.url),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
}
console.log('Íconos PNG generados (180, 192 y 512).');
