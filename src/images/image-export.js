export async function decodeImage(blob){
    if(typeof createImageBitmap==='function'){try{return await createImageBitmap(blob);}catch{}}
    const url=URL.createObjectURL(blob),image=new Image();
    try{return await new Promise((resolve,reject)=>{image.onload=()=>resolve(image);image.onerror=()=>reject(Error('无法读取图片，请重新下载'));image.src=url;});}
    finally{URL.revokeObjectURL(url);}
}
export async function prepareImageExport(blob,name='miao-image.png',format='png'){
    if(format!=='jpg')return {blob,name};
    const image=await decodeImage(blob),canvas=document.createElement('canvas');
    try{
        canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;
        if(!canvas.width||!canvas.height)throw Error('图片尺寸无效，无法导出 JPG');
        const context=canvas.getContext('2d');if(!context)throw Error('浏览器无法转换 JPG');
        context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);
        const jpg=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?.type==='image/jpeg'?resolve(value):reject(Error('JPG 转换失败，请重试或选择 PNG')),'image/jpeg',0.92));
        return {blob:jpg,name:name.replace(/\.[^.]+$/,'')+'.jpg'};
    }finally{image.close?.();canvas.width=canvas.height=0;}
}
